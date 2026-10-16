import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import { db, type Tx } from "../db/db";
import { truckingRefCounterTable } from "../schemas/truckingConsignment.schema";
import {
  truckingInternalChargeTable,
  truckingInternalMonthTable,
  truckingInternalStatementTable,
  type NewTruckingInternalChargeRecord,
  type NewTruckingInternalStatementRecord,
  type TruckingInternalChargeRecord,
  type TruckingInternalMonthRecord,
  type TruckingInternalStatementRecord,
} from "../schemas/internal.schema";
import { formatStatementNumber, MAX_STATEMENT_NUMBER } from "../lib/internalBilling";

const ch = truckingInternalChargeTable;
const mo = truckingInternalMonthTable;
const st = truckingInternalStatementTable;

type Reader = Tx | typeof db;

// The internal billing ledger (Phase 6 C): charges (append-only), closed months and statements.
class InternalRepository {
  /**
   * Serialises every write to a company's internal ledger (a charge, a reversal, a month close)
   * for the caller's transaction, so a charge never slips into a month being closed.
   */
  async lockLedger(tx: Tx, companyId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-internal:${companyId}`}))`);
  }

  /** The next ICZ statement number for the year of the billed month (the shared counter row stays locked until the transaction ends). */
  async allocateStatementNumber(tx: Tx, companyId: string, year: number): Promise<string> {
    const res = await tx.execute<{ last: number }>(sql`
      INSERT INTO ${truckingRefCounterTable} (company_id, sequence, year, last) VALUES (${companyId}, 'ICZ', ${year}, 1)
      ON CONFLICT (company_id, sequence, year) DO UPDATE SET last = ${truckingRefCounterTable}.last + 1, updated_at = now()
      RETURNING last`);
    const n = Number(res.rows[0]!.last);
    if (n > MAX_STATEMENT_NUMBER) throw APIError.resourceExhausted(`ICZ statement numbers for ${year} are used up`);
    return formatStatementNumber(year, n);
  }

  async insertCharges(tx: Tx, rows: NewTruckingInternalChargeRecord[]): Promise<TruckingInternalChargeRecord[]> {
    if (!rows.length) return [];
    return tx.insert(ch).values(rows).returning();
  }

  async chargesForConsignment(companyId: string, consignmentId: string, reader: Reader = db): Promise<TruckingInternalChargeRecord[]> {
    return reader
      .select()
      .from(ch)
      .where(and(eq(ch.companyId, companyId), eq(ch.consignmentId, consignmentId)))
      .orderBy(asc(ch.createdAt));
  }

  async chargesForMonths(companyId: string, months: string[], reader: Reader = db): Promise<TruckingInternalChargeRecord[]> {
    if (!months.length) return [];
    return reader
      .select()
      .from(ch)
      .where(and(eq(ch.companyId, companyId), inArray(ch.month, months)))
      .orderBy(asc(ch.department), asc(ch.createdAt));
  }

  /** The ids among `ids` that a later row reverses. */
  async reversedAmong(companyId: string, ids: string[], reader: Reader = db): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await reader
      .select({ id: ch.reversesId })
      .from(ch)
      .where(and(eq(ch.companyId, companyId), inArray(ch.reversesId, ids)));
    return new Set(rows.map((r) => r.id!));
  }

  /** The closed months among `months`. */
  async closedMonths(companyId: string, months: string[], reader: Reader = db): Promise<TruckingInternalMonthRecord[]> {
    if (!months.length) return [];
    return reader.select().from(mo).where(and(eq(mo.companyId, companyId), inArray(mo.month, months)));
  }

  /** Closes a month; null when it was closed already. */
  async closeMonth(tx: Tx, companyId: string, month: string, by: { name: string; userId: string | null }): Promise<TruckingInternalMonthRecord | null> {
    const [row] = await tx.insert(mo).values({ companyId, month, closedBy: by.name, closedByUserId: by.userId }).onConflictDoNothing().returning();
    return row ?? null;
  }

  async insertStatement(tx: Tx, values: NewTruckingInternalStatementRecord): Promise<TruckingInternalStatementRecord> {
    const [row] = await tx.insert(st).values(values).returning();
    return row!;
  }

  async statementsForMonths(companyId: string, months: string[], reader: Reader = db): Promise<TruckingInternalStatementRecord[]> {
    if (!months.length) return [];
    return reader.select().from(st).where(and(eq(st.companyId, companyId), inArray(st.month, months))).orderBy(asc(st.number));
  }

  async statement(companyId: string, number: string): Promise<TruckingInternalStatementRecord | null> {
    const [row] = await db.select().from(st).where(and(eq(st.companyId, companyId), eq(st.number, number)));
    return row ?? null;
  }
}

export const internalRepository = new InternalRepository();
