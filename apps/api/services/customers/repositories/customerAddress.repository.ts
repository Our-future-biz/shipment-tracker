import { and, arrayContains, eq, asc, isNull, ne, or } from "drizzle-orm";
import { ADDRESS_TYPES, type AddressType } from "../interfaces/interfaces";
import { TenantRepository, type InsertForCompany } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerAddressTable, type CustomerAddressRecord } from "../schemas/customerAddress.schema";
import { customerTable } from "../schemas/customer.schema";
import { customerSiteTable, type NewCustomerSiteRecord } from "../schemas/customerSite.schema";
import { seatColumns, type SeatColumns, type SeatRow } from "../lib/seat";
import { siteFieldsOf, siteKindOf, siteMoved } from "../lib/addressSite";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const isSeat = (types: readonly string[] | undefined) => !!types?.includes("Registered");

// A live address that is (also) the customer's seat.
const seatAddress = () => arrayContains(customerAddressTable.types, ["Registered"]);

// The customer's seat columns written again from its live Registered address (or emptied without
// one). Only when they differ, so a write that changes nothing about the seat leaves the customer be.
async function writeSeat(tx: Tx, companyId: string, customerId: string, values: SeatColumns): Promise<boolean> {
  const differs = [ne(customerTable.registeredAddress, values.registeredAddress), ne(customerTable.city, values.city)];
  if (values.country !== undefined) differs.push(ne(customerTable.country, values.country));
  const rows = await tx
    .update(customerTable)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(customerTable.id, customerId), eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt), or(...differs)))
    .returning({ id: customerTable.id });
  return rows.length > 0;
}

async function copySeat(tx: Tx, companyId: string, customerId: string): Promise<void> {
  const [seat] = await tx
    .select({ street: customerAddressTable.street, city: customerAddressTable.city, postalCode: customerAddressTable.postalCode, country: customerAddressTable.country })
    .from(customerAddressTable)
    .where(and(
      eq(customerAddressTable.companyId, companyId),
      eq(customerAddressTable.customerId, customerId),
      seatAddress(),
      isNull(customerAddressTable.deletedAt),
    ))
    .limit(1);
  await writeSeat(tx, companyId, customerId, seatColumns(seat ?? null));
}

/** What a site keeps besides its address (lib/addressSite): set from the Sites tab with an address write. */
export type SiteDetails = Partial<
  Pick<NewCustomerSiteRecord, "lat" | "lng" | "openingHours" | "avizaceName" | "avizacePhone" | "avizaceEmail" | "loadingNotes" | "tailLiftNeeded" | "isDefault">
>;

// The address's site written again from it: added when it is Pickup or Delivery and has none,
// updated when it has one (its map position cleared when the address moved), removed when it is
// neither any more or is deleted. `details` are the Sites tab's own fields, written with it.
async function syncSite(tx: Tx, companyId: string, address: CustomerAddressRecord, details: SiteDetails = {}): Promise<void> {
  const [site] = await tx
    .select()
    .from(customerSiteTable)
    .where(and(eq(customerSiteTable.companyId, companyId), eq(customerSiteTable.addressId, address.id), isNull(customerSiteTable.deletedAt)))
    .limit(1);
  const kind = address.deletedAt ? null : siteKindOf(address.types);
  const now = new Date();
  if (!kind) {
    if (site) await tx.update(customerSiteTable).set({ deletedAt: now, updatedAt: now }).where(and(eq(customerSiteTable.companyId, companyId), eq(customerSiteTable.id, site.id)));
    return;
  }
  const fields = siteFieldsOf(address, kind);
  if (site) {
    const moved = siteMoved(site, fields) ? { lat: null, lng: null } : {};
    await tx
      .update(customerSiteTable)
      .set({ ...fields, ...moved, ...details, updatedAt: now })
      .where(and(eq(customerSiteTable.companyId, companyId), eq(customerSiteTable.id, site.id)));
    return;
  }
  await tx.insert(customerSiteTable).values({ ...fields, ...details, companyId, customerId: address.customerId, addressId: address.id });
}

class CustomerAddressRepository extends TenantRepository<typeof customerAddressTable> {
  constructor() {
    super(db, customerAddressTable, "customer_address");
  }

  // Scoped by company as well as customer, so a guessed customerId from another company returns nothing.
  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(customerAddressTable)
      .where(and(
        eq(customerAddressTable.companyId, companyId),
        eq(customerAddressTable.customerId, customerId),
        isNull(customerAddressTable.deletedAt),
      ))
      .orderBy(asc(customerAddressTable.createdAt));
  }

  // The writes below keep the customer's seat columns in step with a Registered address, and a
  // Pickup / Delivery address's site with it, in the same transaction ("everything must be
  // linked", owner, 26 Oct 2026).

  async createWithSeat(companyId: string, data: InsertForCompany<typeof customerAddressTable>, site?: SiteDetails): Promise<CustomerAddressRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(customerAddressTable).values({ ...data, companyId }).returning();
      if (isSeat(row!.types)) await copySeat(tx, companyId, row!.customerId);
      await syncSite(tx, companyId, row!, site);
      return row!;
    });
  }

  // A type change counts both ways: an address made (also) Registered becomes the seat, and the
  // seat no longer Registered leaves the customer without one.
  async updateWithSeat(
    id: string,
    companyId: string,
    data: Partial<InsertForCompany<typeof customerAddressTable>>,
    site?: SiteDetails,
  ): Promise<CustomerAddressRecord | null> {
    return this.db.transaction(async (tx) => {
      const live = and(eq(customerAddressTable.id, id), eq(customerAddressTable.companyId, companyId), isNull(customerAddressTable.deletedAt));
      const [before] = await tx.select({ types: customerAddressTable.types }).from(customerAddressTable).where(live).limit(1);
      if (!before) return null;
      const [row] = await tx.update(customerAddressTable).set({ ...data, updatedAt: new Date() }).where(live).returning();
      if (!row) return null;
      if (isSeat(before.types) || isSeat(row.types)) await copySeat(tx, companyId, row.customerId);
      await syncSite(tx, companyId, row, site);
      return row;
    });
  }

  // Billing moved to this address in one transaction: first taken off the customer's other live
  // addresses (one that was only Billing becomes Paperwork), then added here, so the one-billing
  // index never sees two. Billing touches neither the seat nor a site. The rows are locked before
  // their types are read, so an edit or a delete at the same moment waits instead of being
  // overwritten from what was read.
  async moveBilling(id: string, companyId: string): Promise<CustomerAddressRecord | null> {
    return this.db.transaction(async (tx) => {
      const live = and(eq(customerAddressTable.id, id), eq(customerAddressTable.companyId, companyId), isNull(customerAddressTable.deletedAt));
      const [row] = await tx.select().from(customerAddressTable).where(live).limit(1).for("update");
      if (!row) return null;
      if (row.types.includes("Billing")) return row;
      const now = new Date();
      const others = await tx
        .select({ id: customerAddressTable.id, types: customerAddressTable.types })
        .from(customerAddressTable)
        .where(and(
          eq(customerAddressTable.companyId, companyId),
          eq(customerAddressTable.customerId, row.customerId),
          arrayContains(customerAddressTable.types, ["Billing"]),
          isNull(customerAddressTable.deletedAt),
          ne(customerAddressTable.id, id),
        ))
        .for("update");
      for (const other of others) {
        const rest = other.types.filter((t) => t !== "Billing");
        await tx
          .update(customerAddressTable)
          .set({ types: rest.length ? rest : ["Paperwork"], updatedAt: now })
          .where(eq(customerAddressTable.id, other.id));
      }
      const types: AddressType[] = ADDRESS_TYPES.filter((t) => t === "Billing" || row.types.includes(t));
      const [moved] = await tx.update(customerAddressTable).set({ types, updatedAt: now }).where(live).returning();
      // Locked above, so it is still live; were it not, nothing of the move may stay.
      if (!moved) throw new Error("The address changed while Billing was moved to it");
      return moved;
    });
  }

  async softDeleteWithSeat(id: string, companyId: string): Promise<CustomerAddressRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(customerAddressTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(customerAddressTable.id, id), eq(customerAddressTable.companyId, companyId), isNull(customerAddressTable.deletedAt)))
        .returning();
      if (!row) return null;
      if (isSeat(row.types)) await copySeat(tx, companyId, row.customerId);
      await syncSite(tx, companyId, row);
      return row;
    });
  }

  /** The live address of the company with this id; null when there is none. */
  async findLive(id: string, companyId: string): Promise<CustomerAddressRecord | null> {
    const [row] = await this.db
      .select()
      .from(customerAddressTable)
      .where(and(eq(customerAddressTable.id, id), eq(customerAddressTable.companyId, companyId), isNull(customerAddressTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** Every live customer of the company with its live Registered address (at most one), for the seat backfill. */
  async seatsOf(companyId: string): Promise<SeatRow[]> {
    const rows = await this.db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        registeredAddress: customerTable.registeredAddress,
        city: customerTable.city,
        country: customerTable.country,
        createdAt: customerTable.createdAt,
        seatId: customerAddressTable.id,
        street: customerAddressTable.street,
        seatCity: customerAddressTable.city,
        postalCode: customerAddressTable.postalCode,
        seatCountry: customerAddressTable.country,
        seatUpdatedAt: customerAddressTable.updatedAt,
      })
      .from(customerTable)
      .leftJoin(
        customerAddressTable,
        and(
          eq(customerAddressTable.customerId, customerTable.id),
          eq(customerAddressTable.companyId, companyId),
          seatAddress(),
          isNull(customerAddressTable.deletedAt),
        ),
      )
      .where(and(eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)))
      .orderBy(asc(customerTable.companyName));
    return rows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      registeredAddress: r.registeredAddress,
      city: r.city,
      country: r.country,
      createdAt: r.createdAt,
      seat: r.seatId
        ? { street: r.street ?? "", city: r.seatCity ?? "", postalCode: r.postalCode ?? "", country: r.seatCountry ?? "", updatedAt: r.seatUpdatedAt! }
        : null,
    }));
  }

  /** Writes the planned seat columns in one transaction; how many customers changed. */
  async applySeats(companyId: string, changes: { customerId: string; values: SeatColumns }[]): Promise<number> {
    if (!changes.length) return 0;
    return this.db.transaction(async (tx) => {
      let changed = 0;
      for (const { customerId, values } of changes) {
        if (await writeSeat(tx, companyId, customerId, values)) changed++;
      }
      return changed;
    });
  }
}

export const customerAddressRepository = new CustomerAddressRepository();
