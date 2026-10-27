import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { truckingConsignmentTable, truckingTripTable } from "../schemas/truckingConsignment.schema";

const c = truckingConsignmentTable;
const t = truckingTripTable;

// The Customer Database names Trucking keeps next to their ids, so its lists can be searched and
// exported as text: a consignment's customer and a trip's haulier. They are rewritten by id when
// the name changes there, only where they differ (a message delivered twice changes nothing).
// The version is not bumped: a rename is no edit, so a form open meanwhile still saves.

/**
 * Reads the name to write from the Customer Database, once the rename holds its turn (see
 * renameCustomer). null or blank leaves the copies as they are.
 */
export type CurrentName = () => Promise<string | null>;

/** How many consignments (as customer) and trips (as haulier) a rename changed. */
export interface RenameCounts {
  consignments: number;
  trips: number;
}

/** Where a copied name is kept (also the `field` of the backfill's unmatched names). */
export type CopiedNameField = "consignment.customerName" | "trip.haulierName";

/** One name as stored for one id, and how many live rows hold it. */
export interface StoredName {
  field: CopiedNameField;
  id: string;
  name: string;
  count: number;
}

class CustomerLinksRepository {
  /**
   * A change event's rename: the customer's name as read by `currentName` goes to its consignments
   * and trips, in one transaction. Renames of one customer take turns and each reads the name only
   * once it has its turn (the lock lasts until the transaction ends), so one that read an older
   * name never commits after one that read the newer: a late or repeated event leaves the current name.
   */
  async renameCustomer(companyId: string, customerId: string, currentName: CurrentName): Promise<RenameCounts> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-customer-rename:${companyId}:${customerId}`}))`);
      const name = (await currentName())?.trim();
      // A copy is never blanked out.
      if (!name) return { consignments: 0, trips: 0 };
      return {
        consignments: await this.renameConsignmentCustomer(tx, companyId, customerId, name),
        trips: await this.renameTripHaulier(tx, companyId, customerId, name),
      };
    });
  }

  /** Writes the customer's name on its live consignments (cancelled ones too); answers how many changed. */
  async renameConsignmentCustomer(writer: Tx | typeof db, companyId: string, customerId: string, name: string): Promise<number> {
    const rows = await writer
      .update(c)
      .set({ customerName: name, updatedAt: new Date() })
      .where(and(eq(c.companyId, companyId), eq(c.customerId, customerId), isNull(c.deletedAt), ne(c.customerName, name)))
      .returning({ id: c.id });
    return rows.length;
  }

  /** Writes the haulier's name on its live trips (cancelled ones too); answers how many changed. */
  async renameTripHaulier(writer: Tx | typeof db, companyId: string, haulierId: string, name: string): Promise<number> {
    const rows = await writer
      .update(t)
      .set({ haulierName: name, updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.haulierCustomerId, haulierId), isNull(t.deletedAt), ne(t.haulierName, name)))
      .returning({ id: t.id });
    return rows.length;
  }

  /** Every copied name of the company's live consignments and trips, by id (the backfill). */
  async storedNames(companyId: string): Promise<StoredName[]> {
    const count = sql<number>`count(*)::int`;
    const [consignments, trips] = await Promise.all([
      db
        .select({ id: c.customerId, name: c.customerName, count })
        .from(c)
        .where(and(eq(c.companyId, companyId), isNull(c.deletedAt)))
        .groupBy(c.customerId, c.customerName),
      db
        .select({ id: t.haulierCustomerId, name: t.haulierName, count })
        .from(t)
        .where(and(eq(t.companyId, companyId), isNull(t.deletedAt)))
        .groupBy(t.haulierCustomerId, t.haulierName),
    ]);
    return [
      ...consignments.map((r) => ({ field: "consignment.customerName" as const, ...r })),
      ...trips.map((r) => ({ field: "trip.haulierName" as const, ...r })),
    ];
  }
}

export const customerLinksRepository = new CustomerLinksRepository();
