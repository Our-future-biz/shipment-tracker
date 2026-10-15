import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { truckingExceptionTable, type ClaimTargetKind, type NewTruckingExceptionRecord, type TruckingExceptionRecord } from "../schemas/avizace.schema";
import type { ExceptionKind } from "../interfaces/avizace.interfaces";

const e = truckingExceptionTable;
const MAX_LIST = 500;

export type ExceptionValues = Partial<Omit<NewTruckingExceptionRecord, "id" | "companyId" | "consignmentId" | "version" | "createdAt">>;

/** What must still hold for a guarded exception write. */
export interface ExceptionGuard {
  version?: number;
  /** Still PENDING */
  pending?: boolean;
  /** Not closed */
  open?: boolean;
}

const live = (companyId: string) => [eq(e.companyId, companyId), isNull(e.deletedAt)];

// Delivery exceptions of consignments (Phase 6 A).
class ExceptionRepository {
  async insert(tx: Tx, values: NewTruckingExceptionRecord): Promise<TruckingExceptionRecord> {
    const [row] = await tx.insert(e).values(values).returning();
    return row!;
  }

  async find(companyId: string, id: string, reader: Tx | typeof db = db): Promise<TruckingExceptionRecord | null> {
    const [row] = await reader.select().from(e).where(and(...live(companyId), eq(e.id, id)));
    return row ?? null;
  }

  /** The exceptions of consignments, newest first. */
  async forConsignments(companyId: string, consignmentIds: string[], reader: Tx | typeof db = db): Promise<TruckingExceptionRecord[]> {
    if (!consignmentIds.length) return [];
    return reader.select().from(e).where(and(...live(companyId), inArray(e.consignmentId, consignmentIds))).orderBy(desc(e.createdAt));
  }

  /** How many exceptions of each consignment are not closed. */
  async openCounts(companyId: string, consignmentIds: string[], reader: Tx | typeof db = db): Promise<Map<string, number>> {
    if (!consignmentIds.length) return new Map();
    const rows = await reader
      .select({ consignmentId: e.consignmentId, n: sql<number>`count(*)::int` })
      .from(e)
      .where(and(...live(companyId), inArray(e.consignmentId, consignmentIds), isNull(e.closedAt)))
      .groupBy(e.consignmentId);
    return new Map(rows.map((r) => [r.consignmentId, Number(r.n)]));
  }

  /** The cross-consignment list, newest first (at most 500). */
  async list(companyId: string, f: { open?: boolean; kind?: ExceptionKind; consignmentId?: string }): Promise<TruckingExceptionRecord[]> {
    const clauses: SQL[] = live(companyId);
    if (f.open === true) clauses.push(isNull(e.closedAt));
    if (f.open === false) clauses.push(isNotNull(e.closedAt));
    if (f.kind) clauses.push(eq(e.kind, f.kind));
    if (f.consignmentId) clauses.push(eq(e.consignmentId, f.consignmentId));
    return db.select().from(e).where(and(...clauses)).orderBy(desc(e.createdAt)).limit(MAX_LIST);
  }

  /** Writes `values` when the guard still holds (bumps the version); null when it no longer does. */
  async update(tx: Tx, companyId: string, id: string, values: ExceptionValues, guard: ExceptionGuard = {}): Promise<TruckingExceptionRecord | null> {
    const clauses: SQL[] = [...live(companyId), eq(e.id, id)];
    if (guard.version !== undefined) clauses.push(eq(e.version, guard.version));
    if (guard.pending) clauses.push(eq(e.decision, "PENDING"));
    if (guard.open) clauses.push(isNull(e.closedAt));
    const [row] = await tx
      .update(e)
      .set({ ...values, version: sql`${e.version} + 1`, updatedAt: new Date() })
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /**
   * The CLAIM_HAULIER claims against trips / partner legs (for matching a haulier invoice:
   * expected = the target's cost − the claims), one row per claim.
   */
  async claimsFor(companyId: string, targetIds: string[], reader: Tx | typeof db = db): Promise<{ targetKind: ClaimTargetKind; targetId: string; amount: number; currency: "CZK" | "EUR"; exceptionId: string }[]> {
    if (!targetIds.length) return [];
    const rows = await reader
      .select({ targetKind: e.claimTargetKind, targetId: e.claimTargetId, amount: e.amount, currency: e.currency, exceptionId: e.id })
      .from(e)
      .where(and(...live(companyId), eq(e.decision, "CLAIM_HAULIER"), inArray(e.claimTargetId, targetIds)));
    return rows.map((r) => ({ targetKind: r.targetKind!, targetId: r.targetId!, amount: r.amount ?? 0, currency: r.currency, exceptionId: r.exceptionId }));
  }
}

export const exceptionRepository = new ExceptionRepository();
