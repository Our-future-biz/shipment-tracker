import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import {
  truckingHaulierInvoiceLineTable,
  truckingHaulierInvoiceTable,
  type HaulierInvoiceAllocation,
  type NewTruckingHaulierInvoiceLineRecord,
  type NewTruckingHaulierInvoiceRecord,
  type TruckingHaulierInvoiceLineRecord,
  type TruckingHaulierInvoiceRecord,
} from "../schemas/haulierInvoice.schema";
import {
  truckingConsignmentTable,
  truckingLegTable,
  truckingTripTable,
  type TruckingConsignmentRecord,
  type TruckingLegRecord,
  type TruckingTripRecord,
} from "../schemas/truckingConsignment.schema";
import type { HaulierInvoiceStatus, HaulierInvoiceTargetKind } from "../interfaces/haulierInvoice.interfaces";

const i = truckingHaulierInvoiceTable;
const li = truckingHaulierInvoiceLineTable;
const MAX_LIST = 1000;

export interface StoredInvoice {
  invoice: TruckingHaulierInvoiceRecord;
  lines: TruckingHaulierInvoiceLineRecord[];
}

/** Invoice columns a save writes (the version is bumped here). */
export type InvoiceValues = Partial<Omit<NewTruckingHaulierInvoiceRecord, "id" | "companyId" | "version" | "createdAt">>;
/** A line as a save writes it (without company and invoice). */
export type LineValues = Omit<NewTruckingHaulierInvoiceLineRecord, "id" | "companyId" | "invoiceId" | "createdAt" | "updatedAt" | "deletedAt">;

/** A live invoice line of a target, with its invoice. */
export interface TargetUse {
  targetKind: HaulierInvoiceTargetKind;
  targetId: string;
  invoiceId: string;
  invoiceNumber: string;
  status: HaulierInvoiceStatus;
}

const liveLine = (companyId: string) => and(eq(li.companyId, companyId), isNull(li.deletedAt));

// Haulier invoices and their lines. Every write runs in the caller's transaction after
// lockHaulier, so two saves for one haulier never interleave: the duplicate-number and
// target-already-invoiced checks see each other's rows, and the unique indexes catch the rest.
class HaulierInvoiceRepository {
  /** Holds a transaction-scoped lock on the haulier's invoices until the transaction ends. */
  async lockHaulier(tx: Tx, companyId: string, haulierCustomerId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-haulier-invoice:${companyId}:${haulierCustomerId}`}))`);
  }

  /** The live, not rejected invoice of the haulier with this number key (other than `exceptId`). */
  async findByNumber(tx: Tx | typeof db, companyId: string, haulierCustomerId: string, numberKey: string, exceptId?: string): Promise<TruckingHaulierInvoiceRecord | null> {
    const clauses: SQL[] = [
      eq(i.companyId, companyId),
      eq(i.haulierCustomerId, haulierCustomerId),
      eq(i.invoiceNumberKey, numberKey),
      ne(i.status, "REJECTED"),
      isNull(i.deletedAt),
    ];
    if (exceptId) clauses.push(ne(i.id, exceptId));
    const [row] = await tx.select().from(i).where(and(...clauses));
    return row ?? null;
  }

  /** Where these targets are invoiced: their live lines (on invoices not rejected), other than on `exceptInvoiceId`. */
  async targetUses(
    companyId: string,
    targets: { kind: HaulierInvoiceTargetKind; id: string }[],
    exceptInvoiceId?: string,
    reader: Tx | typeof db = db,
  ): Promise<TargetUse[]> {
    if (!targets.length) return [];
    const which = or(...targets.map((t) => and(eq(li.targetKind, t.kind), eq(li.targetId, t.id))));
    const clauses: SQL[] = [liveLine(companyId)!, eq(li.live, true), which!, isNull(i.deletedAt)];
    if (exceptInvoiceId) clauses.push(ne(li.invoiceId, exceptInvoiceId));
    return reader
      .select({ targetKind: li.targetKind, targetId: li.targetId, invoiceId: i.id, invoiceNumber: i.invoiceNumber, status: i.status })
      .from(li)
      .innerJoin(i, eq(i.id, li.invoiceId))
      .where(and(...clauses));
  }

  async insert(tx: Tx, values: NewTruckingHaulierInvoiceRecord, lines: LineValues[]): Promise<StoredInvoice> {
    const [invoice] = await tx.insert(i).values(values).returning();
    const rows = lines.length
      ? await tx
          .insert(li)
          .values(lines.map((l) => ({ ...l, companyId: invoice!.companyId, invoiceId: invoice!.id })))
          .returning()
      : [];
    return { invoice: invoice!, lines: rows };
  }

  /**
   * Writes `values` when the invoice is still at `version` and in one of `statuses`; bumps the
   * version. Null when it no longer is (someone saved, approved or rejected it meanwhile).
   */
  async update(tx: Tx, companyId: string, id: string, version: number, statuses: HaulierInvoiceStatus[], values: InvoiceValues): Promise<TruckingHaulierInvoiceRecord | null> {
    const [row] = await tx
      .update(i)
      .set({ ...values, version: sql`${i.version} + 1`, updatedAt: new Date() })
      .where(and(eq(i.companyId, companyId), eq(i.id, id), isNull(i.deletedAt), eq(i.version, version), inArray(i.status, statuses)))
      .returning();
    return row ?? null;
  }

  /** Replaces the invoice's lines (the old ones are soft-deleted). */
  async replaceLines(tx: Tx, companyId: string, invoiceId: string, lines: LineValues[]): Promise<TruckingHaulierInvoiceLineRecord[]> {
    const now = new Date();
    await tx
      .update(li)
      .set({ deletedAt: now, updatedAt: now, live: false })
      .where(and(liveLine(companyId), eq(li.invoiceId, invoiceId)));
    if (!lines.length) return [];
    return tx
      .insert(li)
      .values(lines.map((l) => ({ ...l, companyId, invoiceId })))
      .returning();
  }

  /** A rejected invoice frees its targets for another invoice. */
  async releaseLines(tx: Tx, companyId: string, invoiceId: string): Promise<void> {
    await tx
      .update(li)
      .set({ live: false, updatedAt: new Date() })
      .where(and(liveLine(companyId), eq(li.invoiceId, invoiceId)));
  }

  /** Where an approved line's real cost went. */
  async setAllocations(tx: Tx, companyId: string, lineId: string, allocations: HaulierInvoiceAllocation[]): Promise<void> {
    await tx
      .update(li)
      .set({ allocations, updatedAt: new Date() })
      .where(and(liveLine(companyId), eq(li.id, lineId)));
  }

  async find(companyId: string, id: string): Promise<StoredInvoice | null> {
    const [invoice] = await db.select().from(i).where(and(eq(i.companyId, companyId), eq(i.id, id), isNull(i.deletedAt)));
    if (!invoice) return null;
    const lines = await db
      .select()
      .from(li)
      .where(and(liveLine(companyId), eq(li.invoiceId, id)))
      .orderBy(asc(li.createdAt), asc(li.id));
    return { invoice, lines };
  }

  /** Invoices, newest first (at most 1000), each with its lines. */
  async list(companyId: string, filter: { statuses?: HaulierInvoiceStatus[]; haulierCustomerId?: string }): Promise<StoredInvoice[]> {
    const clauses: SQL[] = [eq(i.companyId, companyId), isNull(i.deletedAt)];
    if (filter.statuses) clauses.push(inArray(i.status, filter.statuses));
    if (filter.haulierCustomerId) clauses.push(eq(i.haulierCustomerId, filter.haulierCustomerId));
    const invoices = await db
      .select()
      .from(i)
      .where(and(...clauses))
      .orderBy(desc(i.issueDate), desc(i.createdAt))
      .limit(MAX_LIST);
    if (!invoices.length) return [];
    const lines = await db
      .select()
      .from(li)
      .where(and(liveLine(companyId), inArray(li.invoiceId, invoices.map((x) => x.id))))
      .orderBy(asc(li.createdAt), asc(li.id));
    return invoices.map((invoice) => ({ invoice, lines: lines.filter((l) => l.invoiceId === invoice.id) }));
  }

  // ---- what a haulier may invoice ---------------------------------------------------------------

  /** The haulier's done, priced, not cancelled trips. */
  async doneTrips(companyId: string, haulierCustomerId: string): Promise<TruckingTripRecord[]> {
    const t = truckingTripTable;
    return db
      .select()
      .from(t)
      .where(
        and(
          eq(t.companyId, companyId),
          eq(t.haulierCustomerId, haulierCustomerId),
          eq(t.status, "DONE"),
          isNull(t.cancelledAt),
          isNull(t.deletedAt),
          isNotNull(t.buy),
        ),
      )
      .orderBy(asc(t.plannedPickupDate), asc(t.ref))
      .limit(MAX_LIST);
  }

  /** The haulier's done, priced partner deliveries (delivery legs on no trip) of live consignments, with the consignment. */
  async donePartnerLegs(companyId: string, haulierCustomerId: string): Promise<{ leg: TruckingLegRecord; consignment: TruckingConsignmentRecord }[]> {
    const l = truckingLegTable;
    const c = truckingConsignmentTable;
    const rows = await db
      .select({ leg: l, consignment: c })
      .from(l)
      .innerJoin(c, eq(c.id, l.consignmentId))
      .where(
        and(
          eq(l.companyId, companyId),
          eq(l.haulierCustomerId, haulierCustomerId),
          eq(l.kind, "DELIVERY"),
          eq(l.status, "DONE"),
          isNull(l.tripId),
          isNull(l.deletedAt),
          isNotNull(l.buy),
          isNull(c.cancelledAt),
          isNull(c.deletedAt),
        ),
      )
      .orderBy(asc(c.deliveredAt), asc(c.ref))
      .limit(MAX_LIST);
    return rows;
  }
}

export const haulierInvoiceRepository = new HaulierInvoiceRepository();
