import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
  bankStatementEntryTable as e,
  bankStatementTable as s,
  type BankEntryAllocation,
  type BankEntryStatus,
  type BankStatementEntryRecord,
  type BankStatementRecord,
  type NewBankStatementEntryRecord,
  type NewBankStatementRecord,
} from "../schemas/bankStatement.schema";
import { receivablePaymentTable as rp } from "../schemas/receivable.schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Bank statements read into Accounts Receivable (schemas/bankStatement). A file once per company (file_sha256), an
// entry once per company (entry_key): an entry read again from an overlapping file is not stored twice.

const LIST_LIMIT = 200;
/** Open incoming entries read for the "payment waiting" check: far more than a month's statements leave undecided. */
const OPEN_INCOMING_LIMIT = 2000;
const INSERT_CHUNK = 500;

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export interface StatusCount {
  statementId: string;
  status: BankEntryStatus;
  n: number;
}

/** Who decided and why, written with a confirm or a set-aside. */
export interface Decision {
  userId: string;
  by: string;
  reason?: string;
}

const OPEN = sql`${e.status} in ('proposed', 'no_match')`;
/** Open, or - `reopened`: a payment it noted was taken back since - confirmed (decided again from the version seen). */
const DECIDABLE_NOW = (reopened: boolean) => (reopened ? sql`${e.status} in ('proposed', 'no_match', 'confirmed')` : OPEN);

/**
 * The entries shown under a statement: its own, and those of the same account booked within its days that another
 * file stored first (a CAMT.053 statement lists every booked entry of its account in its period).
 */
function shownUnder(statement: Pick<BankStatementRecord, "id" | "companyId" | "accountIban" | "fromDate" | "toDate">) {
  const own = eq(e.statementId, statement.id);
  if (!statement.fromDate || !statement.toDate || !statement.accountIban) return own;
  const sameAccount = sql`${e.statementId} in (select x.id from bank_statement x where x.company_id = ${statement.companyId}::uuid and x.account_iban = ${statement.accountIban} and x.deleted_at is null)`;
  return or(own, and(sameAccount, isNotNull(e.bookingDate), gte(e.bookingDate, statement.fromDate), lte(e.bookingDate, statement.toDate)));
}

class BankStatementRepository {
  async bySha(companyId: string, sha: string): Promise<BankStatementRecord | null> {
    const [row] = await db
      .select()
      .from(s)
      .where(and(eq(s.companyId, companyId), eq(s.fileSha256, sha), isNull(s.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /**
   * The statement and its entries in one transaction. Answers null when the same file was stored meanwhile (the
   * unique file key), else the statement and how many entries were new (the rest were stored before by another file).
   */
  async importStatement(statement: NewBankStatementRecord, entries: Omit<NewBankStatementEntryRecord, "statementId">[]): Promise<{ statement: BankStatementRecord; added: number } | null> {
    return db.transaction(async (tx) => {
      const [made] = await tx.insert(s).values(statement).onConflictDoNothing().returning();
      if (!made) return null;
      let added = 0;
      for (const batch of chunks(entries, INSERT_CHUNK)) {
        const rows = await tx
          .insert(e)
          .values(batch.map((x) => ({ ...x, statementId: made.id })))
          .onConflictDoNothing()
          .returning({ id: e.id });
        added += rows.length;
      }
      return { statement: made, added };
    });
  }

  async list(companyId: string): Promise<BankStatementRecord[]> {
    return db
      .select()
      .from(s)
      .where(and(eq(s.companyId, companyId), isNull(s.deletedAt)))
      .orderBy(desc(s.createdAt), desc(s.id))
      .limit(LIST_LIMIT);
  }

  async byId(companyId: string, id: string): Promise<BankStatementRecord | null> {
    const [row] = await db
      .select()
      .from(s)
      .where(and(eq(s.companyId, companyId), eq(s.id, id), isNull(s.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** How many entries of each status each statement stored itself. */
  async statusCounts(companyId: string, statementIds: string[]): Promise<StatusCount[]> {
    if (!statementIds.length) return [];
    const rows = await db
      .select({ statementId: e.statementId, status: e.status, n: sql<number>`count(*)::int` })
      .from(e)
      .where(and(eq(e.companyId, companyId), isNull(e.deletedAt), inArray(e.statementId, statementIds)))
      .groupBy(e.statementId, e.status);
    return rows.map((r) => ({ statementId: r.statementId, status: r.status, n: Number(r.n) }));
  }

  async entriesOf(statement: BankStatementRecord): Promise<BankStatementEntryRecord[]> {
    return db
      .select()
      .from(e)
      .where(and(eq(e.companyId, statement.companyId), isNull(e.deletedAt), shownUnder(statement)))
      .orderBy(asc(e.bookingDate), asc(e.createdAt), asc(e.id));
  }

  /** One entry shown under the statement, or null. */
  async entryOf(statement: BankStatementRecord, entryId: string): Promise<BankStatementEntryRecord | null> {
    const [row] = await db
      .select()
      .from(e)
      .where(and(eq(e.companyId, statement.companyId), eq(e.id, entryId), isNull(e.deletedAt), shownUnder(statement)))
      .limit(1);
    return row ?? null;
  }

  /** The file names of these statements (an entry read first from another file says which). */
  async fileNames(companyId: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await db
      .select({ id: s.id, fileName: s.fileName })
      .from(s)
      .where(and(eq(s.companyId, companyId), inArray(s.id, [...new Set(ids)])));
    return new Map(rows.map((r) => [r.id, r.fileName]));
  }

  /**
   * Confirms an open entry from the version the manager saw: the entry is taken first (a second click or a second
   * manager waits here, then finds the version moved and gets null), then `work` notes the payments in the same
   * transaction and answers what was noted, which is stored on the entry. Anything `work` throws rolls all back.
   */
  async confirm(
    companyId: string,
    entryId: string,
    version: number,
    decision: Decision,
    work: (tx: Tx) => Promise<BankEntryAllocation[]>,
    reopened = false,
  ): Promise<BankStatementEntryRecord | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [taken] = await tx
        .update(e)
        .set({ status: "confirmed", version: version + 1, decidedAt: now, decidedByUserId: decision.userId, decidedBy: decision.by, decisionReason: "", updatedAt: now })
        .where(and(eq(e.companyId, companyId), eq(e.id, entryId), eq(e.version, version), isNull(e.deletedAt), DECIDABLE_NOW(reopened)))
        .returning();
      if (!taken) return null;
      const allocations = await work(tx);
      const [row] = await tx.update(e).set({ allocations }).where(eq(e.id, taken.id)).returning();
      return row ?? null;
    });
  }

  /** Sets an open entry aside with a reason, from the version the manager saw; null when it changed meanwhile. */
  async ignore(companyId: string, entryId: string, version: number, decision: Decision, reopened = false): Promise<BankStatementEntryRecord | null> {
    const now = new Date();
    const [row] = await db
      .update(e)
      .set({ status: "ignored", version: version + 1, decidedAt: now, decidedByUserId: decision.userId, decidedBy: decision.by, decisionReason: decision.reason ?? "", updatedAt: now })
      .where(and(eq(e.companyId, companyId), eq(e.id, entryId), eq(e.version, version), isNull(e.deletedAt), DECIDABLE_NOW(reopened)))
      .returning();
    return row ?? null;
  }

  /**
   * The company's incoming entries no manager has decided yet (proposed or no match), with the file each was read
   * from - the newest booked first, at most `limit` (the "payment waiting" check, mock test council X5).
   */
  async openIncoming(companyId: string, limit = OPEN_INCOMING_LIMIT): Promise<(BankStatementEntryRecord & { fileName: string })[]> {
    const rows = await db
      .select({ entry: e, fileName: s.fileName })
      .from(e)
      .innerJoin(s, eq(s.id, e.statementId))
      .where(and(eq(e.companyId, companyId), isNull(e.deletedAt), isNull(s.deletedAt), eq(e.credit, true), OPEN))
      .orderBy(desc(e.bookingDate), desc(e.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r.entry, fileName: r.fileName }));
  }

  /**
   * Confirmed incoming entries a payment of which was taken back by mistake since (mock test council n2): the entry is
   * open again for what is free on it, so it may pay an invoice as an undecided one does. Booked on or after `since`
   * (or with no booking day), at most `limit`, the newest booked first. A payment taken back as reversed (P8) frees
   * nothing: the money went back.
   */
  async reopenedIncoming(companyId: string, since: string, limit = OPEN_INCOMING_LIMIT): Promise<(BankStatementEntryRecord & { fileName: string })[]> {
    const takenBackByMistake = sql`exists (select 1 from jsonb_array_elements(coalesce(${e.allocations}, '[]'::jsonb)) a
      join "receivable_payment" x on x.id::text = a->>'paymentId' and x.company_id = ${e.companyId}
      where x.taken_back_at is not null and coalesce(x.taken_back_kind, 'mistake') = 'mistake')`;
    const rows = await db
      .select({ entry: e, fileName: s.fileName })
      .from(e)
      .innerJoin(s, eq(s.id, e.statementId))
      .where(
        and(
          eq(e.companyId, companyId),
          isNull(e.deletedAt),
          isNull(s.deletedAt),
          eq(e.credit, true),
          eq(e.status, "confirmed"),
          or(isNull(e.bookingDate), gte(e.bookingDate, since)),
          takenBackByMistake,
        ),
      )
      .orderBy(desc(e.bookingDate), desc(e.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r.entry, fileName: r.fileName }));
  }

  /** Of these payments (lines an entry's confirm noted), the ids of those taken back since. */
  async takenBack(companyId: string, paymentIds: string[]): Promise<Set<string>> {
    return (await this.takenBackKinds(companyId, paymentIds)).takenBack;
  }

  /**
   * Of these payments, those taken back since, and of them those taken back as reversed (P8: the money went back to the
   * customer - it is not free on the entry again). One taken back before migration 0039 was a mistake.
   */
  async takenBackKinds(companyId: string, paymentIds: string[]): Promise<{ takenBack: Set<string>; reversed: Set<string> }> {
    const ids = [...new Set(paymentIds)];
    const takenBack = new Set<string>();
    const reversed = new Set<string>();
    if (!ids.length) return { takenBack, reversed };
    for (const batch of chunks(ids, 5000)) {
      const rows = await db
        .select({ id: rp.id, kind: rp.takenBackKind })
        .from(rp)
        .where(and(eq(rp.companyId, companyId), inArray(rp.id, batch), isNotNull(rp.takenBackAt)));
      for (const r of rows) {
        takenBack.add(r.id);
        if (r.kind === "reversed") reversed.add(r.id);
      }
    }
    return { takenBack, reversed };
  }

  /** When the company last read a bank statement (null: never) - the automatic reminders wait for a recent one (P11). */
  async lastImportAt(companyId: string): Promise<Date | null> {
    const [row] = await db
      .select({ at: sql<Date | string | null>`max(${s.createdAt})` })
      .from(s)
      .where(and(eq(s.companyId, companyId), isNull(s.deletedAt)));
    if (!row?.at) return null;
    return row.at instanceof Date ? row.at : new Date(row.at);
  }
}

export const bankStatementRepository = new BankStatementRepository();
