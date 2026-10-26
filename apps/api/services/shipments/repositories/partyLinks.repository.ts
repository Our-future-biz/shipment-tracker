import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";
import { masterJobTable } from "../schemas/masterJob.schema";
import type { LinkRewrite, MasterJobLinks, ShipmentLinks } from "../lib/contactLinks";

/** A shipment whose Customer or Customer's PIC a write changed, as they now read. */
export interface ShipmentParties {
  id: string;
  customer: string;
  customerPic: string;
}

/** What a rename or a backfill chunk changed: how many values, and the shipments to tell about. */
export interface PartyWrites {
  changed: number;
  /** The shipments whose Customer or Customer's PIC changed. */
  parties: ShipmentParties[];
}

/**
 * Reads the name to write (the Customer Database's, or a delete's last one). Called once the
 * rename holds its turn (see renameCustomer); null or an empty name leaves the copies as they are.
 */
export type CurrentName = () => Promise<string | null>;

const NOTHING: PartyWrites = { changed: 0, parties: [] };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PARTIES_OF = { id: shipmentTable.id, customer: shipmentTable.customer, customerPic: shipmentTable.customerPic };

// The copies of a customer's name, by the id they hold. The shipment's Customer comes first: its
// rows are the ones other services are told about.
const SHIPMENT_NAMES = [
  { id: shipmentTable.customerId, text: shipmentTable.customer, key: "customer" },
  { id: shipmentTable.shipperId, text: shipmentTable.shipper, key: "shipper" },
  { id: shipmentTable.consigneeId, text: shipmentTable.consignee, key: "consignee" },
  { id: shipmentTable.principalPartyId, text: shipmentTable.principalParty, key: "principalParty" },
] as const;
const MASTER_JOB_NAMES = [
  { id: masterJobTable.shipperId, text: masterJobTable.shipper, key: "shipper" },
  { id: masterJobTable.consigneeId, text: masterJobTable.consignee, key: "consignee" },
] as const;
// The copies of a contact's name: by the contact's id and the party it is a contact of.
const SHIPMENT_CONTACTS = [
  { id: shipmentTable.customerPicContactId, party: shipmentTable.customerId, text: shipmentTable.customerPic, key: "customerPic" },
  { id: shipmentTable.shipperContactId, party: shipmentTable.shipperId, text: shipmentTable.shipperContact, key: "shipperContact" },
  { id: shipmentTable.consigneeContactId, party: shipmentTable.consigneeId, text: shipmentTable.consigneeContact, key: "consigneeContact" },
] as const;

const liveShipment = (companyId: string) => and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt));
const liveMasterJob = (companyId: string) => and(eq(masterJobTable.companyId, companyId), isNull(masterJobTable.deletedAt));

/** Each value of `from` still as it was read (null compared as null): an edit made since wins. */
const stillAs = (columns: Record<string, PgColumn>, from: Record<string, unknown>): SQL[] =>
  Object.entries(from).map(([key, value]) => sql`${columns[key]!} IS NOT DISTINCT FROM ${value ?? null}`);

// Renames of one record take turns, and each reads the name only once it has its turn (the lock
// lasts until the transaction ends). So a rename that read an older name can never commit after
// one that read the newer: events delivered late, twice or out of order leave the current name.
const takeTurn = (tx: Tx, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);

// The rewrites below leave updatedAt alone: nobody edited the shipment, the Customer Database
// renamed what it names (as the people backfill does, shipment.repository rewritePeople). They
// write no history lines either, for the same reason.
class PartyLinksRepository {
  /**
   * Writes a customer's current name into the company's live copies that hold its id and differ:
   * a shipment's Customer, Shipper, Consignee and Principal Party, a master job's Shipper and
   * Consignee - in one transaction.
   */
  async renameCustomer(companyId: string, customerId: string, currentName: CurrentName): Promise<PartyWrites> {
    return db.transaction(async (tx) => {
      await takeTurn(tx, `shipments-customer-rename:${companyId}:${customerId}`);
      const name = await currentName();
      if (!name?.trim()) return NOTHING;
      let changed = 0;
      let parties: ShipmentParties[] = [];
      for (const { id, text, key } of SHIPMENT_NAMES) {
        const rows = await tx
          .update(shipmentTable)
          .set({ [key]: name })
          .where(and(liveShipment(companyId), eq(id, customerId), ne(text, name)))
          .returning(PARTIES_OF);
        if (key === "customer") parties = rows;
        changed += rows.length;
      }
      for (const { id, text, key } of MASTER_JOB_NAMES) {
        const rows = await tx
          .update(masterJobTable)
          .set({ [key]: name })
          .where(and(liveMasterJob(companyId), eq(id, customerId), ne(text, name)))
          .returning({ id: masterJobTable.id });
        changed += rows.length;
      }
      return { changed, parties };
    });
  }

  /**
   * Writes a contact's current name into the company's live shipments that link to it - as
   * Customer's PIC, Shipper or Consignee Contact - where it is still a contact of that party and
   * the name differs, in one transaction.
   */
  async renameContact(companyId: string, customerId: string, contactId: string, currentName: CurrentName): Promise<PartyWrites> {
    return db.transaction(async (tx) => {
      await takeTurn(tx, `shipments-contact-rename:${companyId}:${contactId}`);
      const name = await currentName();
      if (!name?.trim()) return NOTHING;
      let changed = 0;
      let parties: ShipmentParties[] = [];
      for (const { id, party, text, key } of SHIPMENT_CONTACTS) {
        const rows = await tx
          .update(shipmentTable)
          .set({ [key]: name })
          .where(and(liveShipment(companyId), eq(id, contactId), eq(party, customerId), ne(text, name)))
          .returning(PARTIES_OF);
        if (key === "customerPic") parties = rows;
        changed += rows.length;
      }
      return { changed, parties };
    });
  }

  /** The company's live shipments whose Customer is the customer: who a repeated customer rename tells. */
  async partiesOfCustomer(companyId: string, customerId: string): Promise<ShipmentParties[]> {
    return db
      .select(PARTIES_OF)
      .from(shipmentTable)
      .where(and(liveShipment(companyId), eq(shipmentTable.customerId, customerId)));
  }

  /** The company's live shipments whose Customer's PIC is the contact (of that customer): who a repeated contact rename tells. */
  async partiesOfContact(companyId: string, customerId: string, contactId: string): Promise<ShipmentParties[]> {
    return db
      .select(PARTIES_OF)
      .from(shipmentTable)
      .where(and(liveShipment(companyId), eq(shipmentTable.customerPicContactId, contactId), eq(shipmentTable.customerId, customerId)));
  }

  /** The party names and contacts of the company's live shipments and master jobs: what the links backfill reads. */
  async linksOf(companyId: string): Promise<{ shipments: ShipmentLinks[]; masterJobs: MasterJobLinks[] }> {
    const [shipments, masterJobs] = await Promise.all([
      db
        .select({
          id: shipmentTable.id,
          customerId: shipmentTable.customerId,
          customer: shipmentTable.customer,
          shipperId: shipmentTable.shipperId,
          shipper: shipmentTable.shipper,
          consigneeId: shipmentTable.consigneeId,
          consignee: shipmentTable.consignee,
          principalPartyId: shipmentTable.principalPartyId,
          principalParty: shipmentTable.principalParty,
          customerPic: shipmentTable.customerPic,
          customerPicContactId: shipmentTable.customerPicContactId,
          shipperContact: shipmentTable.shipperContact,
          shipperContactId: shipmentTable.shipperContactId,
          consigneeContact: shipmentTable.consigneeContact,
          consigneeContactId: shipmentTable.consigneeContactId,
        })
        .from(shipmentTable)
        .where(liveShipment(companyId)),
      db
        .select({
          id: masterJobTable.id,
          shipperId: masterJobTable.shipperId,
          shipper: masterJobTable.shipper,
          consigneeId: masterJobTable.consigneeId,
          consignee: masterJobTable.consignee,
        })
        .from(masterJobTable)
        .where(liveMasterJob(companyId)),
    ]);
    return { shipments, masterJobs };
  }

  /**
   * Applies a chunk of the backfill's rewrites in one transaction. A row is changed only while it
   * still holds every value its rewrite was planned from, so an edit made since the read is kept.
   */
  async applyLinks(
    companyId: string,
    rewrites: { shipments: LinkRewrite<ShipmentLinks>[]; masterJobs: LinkRewrite<MasterJobLinks>[] },
  ): Promise<PartyWrites> {
    if (!rewrites.shipments.length && !rewrites.masterJobs.length) return NOTHING;
    const shipmentColumns: Record<string, PgColumn> = shipmentTable as unknown as Record<string, PgColumn>;
    const masterJobColumns: Record<string, PgColumn> = masterJobTable as unknown as Record<string, PgColumn>;
    return db.transaction(async (tx: Tx) => {
      let changed = 0;
      const parties: ShipmentParties[] = [];
      for (const { id, from, to, values } of rewrites.shipments) {
        const [row] = await tx
          .update(shipmentTable)
          .set(to)
          .where(and(liveShipment(companyId), eq(shipmentTable.id, id), ...stillAs(shipmentColumns, from)))
          .returning(PARTIES_OF);
        if (!row) continue;
        changed += values;
        if ("customer" in to || "customerPic" in to) parties.push(row);
      }
      for (const { id, from, to, values } of rewrites.masterJobs) {
        const [row] = await tx
          .update(masterJobTable)
          .set(to)
          .where(and(liveMasterJob(companyId), eq(masterJobTable.id, id), ...stillAs(masterJobColumns, from)))
          .returning({ id: masterJobTable.id });
        if (row) changed += values;
      }
      return { changed, parties };
    });
  }
}

export const partyLinksRepository = new PartyLinksRepository();
