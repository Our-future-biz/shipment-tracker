import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";

// Accounts Receivable's writes and reads down to the statements Postgres gets, in order: the query builder is the real
// one, over a stand-in for the connection that records every statement and answers with the rows a test lays out. The
// locks a payment and a carry-over take (the invoice's credit lock, the one a credit note, a partial credit note and a
// same-day cancellation are issued under, then the company's), that a note never moves the version and a reminder
// never lowers the level, and how the bell's reads are ordered before their caps. What the statements do to real rows
// needs a database (tests/db).
const fake = vi.hoisted(() => ({
  sent: [] as { sql: string; params: unknown[] }[],
  /** Answers a statement with its rows (each a list of values in column order). */
  answer: (_sql: string): unknown[][] => [],
}));

vi.mock("../../db/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const connection = {
    query: async (query: string | { text: string }, params?: unknown[]) => {
      const text = typeof query === "string" ? query : query.text;
      fake.sent.push({ sql: text, params: params ?? [] });
      const rows = fake.answer(text);
      return { rows, rowCount: rows.length, fields: [] };
    },
  };
  return { db: drizzle({ client: connection as never }) };
});

import { receivableRepository as repo, type InvoiceFigures } from "../../repositories/receivable.repository";
import { receivablePaymentTable, receivableTable } from "../../schemas/receivable.schema";
import type { InvoiceRecord } from "../../schemas/invoice.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const SERIES_LOCK = `invoice-number:${COMPANY}:CN2026CZ00000031-`;
const COMPANY_LOCK = `receivable:${COMPANY}`;

/** A row as the driver gives it: the table's columns in order, from the values given (null for the rest). */
const rowOf = (table: Parameters<typeof getTableColumns>[0], values: Record<string, unknown>) =>
  Object.keys(getTableColumns(table)).map((k) => values[k] ?? null);

const invoice = { id: INV, companyId: COMPANY, kind: "invoice", status: "issued", gross: "1210.00", shipment: { jobNumber: "CZ00000031", jobYear: 2026 } } as unknown as InvoiceRecord;
const figures = (over: Partial<InvoiceFigures> = {}): InvoiceFigures => ({ invoice, credited: 210, paid: 0, writtenOff: 0, bankCharges: 0, waiting: 0, lastPaidOn: null, receivable: null, ...over });

/** What an update sets (the part before its where). */
const setPart = (sql: string) => sql.slice(0, sql.indexOf(" where "));

/** The statements as they were sent, a lock shown by what it locks. */
const steps = () =>
  fake.sent.map((s) => (s.sql.includes("pg_advisory_xact_lock") ? `lock ${String(s.params[0])}` : s.sql.split(" ").slice(0, 3).join(" ")));

beforeEach(() => {
  vi.restoreAllMocks();
  fake.sent = [];
  fake.answer = () => [];
});

describe("a payment (decide with the invoice's credits)", () => {
  it("takes the invoice's credit lock first, then the company's, before anything is read or written", async () => {
    fake.answer = (sql) => (sql.startsWith('update "receivable"') ? [rowOf(receivableTable, { id: "rec-1", invoiceId: INV, version: 4 })] : []);
    const read: string[] = [];
    await repo.decide(COMPANY, { invoiceId: INV, version: 3 }, {}, { action: "payment_noted" }, async () => {
      read.push(steps().join(" | "));
    }, { creditsOf: invoice });
    expect(steps().slice(0, 4)).toEqual(["begin", `lock ${SERIES_LOCK}`, `lock ${COMPANY_LOCK}`, 'update "receivable" set']);
    // The payment's own reads (work) come after both locks.
    expect(read[0]).toContain(`lock ${SERIES_LOCK} | lock ${COMPANY_LOCK}`);
    expect(steps().at(-1)).toBe("commit");
  });

  it("takes only the company's lock for a take-back (no credits are read for it)", async () => {
    fake.answer = (sql) => (sql.startsWith('update "receivable"') ? [rowOf(receivableTable, { id: "rec-1", invoiceId: INV, version: 4 })] : []);
    await repo.decide(COMPANY, { invoiceId: INV, version: 3 }, {}, { action: "payment_taken_back" });
    expect(steps().filter((s) => s.startsWith("lock"))).toEqual([`lock ${COMPANY_LOCK}`]);
  });
});

describe("the carry-over (D15)", () => {
  it("writes each paid invoice in a transaction of its own, under its credit lock and then the company's, its credits read again there", async () => {
    const reads: { inTx: boolean; at: number }[] = [];
    vi.spyOn(repo, "figuresOne").mockImplementation(async (_c, _id, reader) => {
      reads.push({ inTx: reader !== undefined, at: fake.sent.length });
      return figures();
    });
    fake.answer = (sql) => {
      if (sql.startsWith('select "id", "created_at"') && sql.includes('from "receivable"')) return [rowOf(receivableTable, { id: "rec-1", invoiceId: INV, carriedChecked: false, version: 1 })];
      if (sql.startsWith("select count(*)")) return [[0]];
      if (sql.startsWith('insert into "receivable_payment"')) return [rowOf(receivablePaymentTable, { id: "pay-1", invoiceId: INV, kind: "carried_over", amount: "1000.00" })];
      return [];
    };
    await expect(repo.carryOver(COMPANY, [{ invoiceId: INV, paid: true }, { invoiceId: "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6b", paid: false }], () => [])).resolves.toEqual([INV]);
    const s = steps();
    expect(s.slice(0, 3)).toEqual(["begin", `lock ${SERIES_LOCK}`, `lock ${COMPANY_LOCK}`]);
    // Read once outside (only for the series), then again under both locks.
    expect(reads).toEqual([
      { inTx: false, at: 0 },
      { inTx: true, at: expect.any(Number) },
    ]);
    expect(reads[1]!.at).toBeGreaterThan(s.indexOf(`lock ${COMPANY_LOCK}`));
    // What is owed after the credit notes read under the locks: 1210 - 210.
    const payment = fake.sent.find((x) => x.sql.startsWith('insert into "receivable_payment"'))!;
    expect(payment.params).toContain("1000.00");
    expect(s.indexOf("commit")).toBeGreaterThan(s.indexOf('insert into "receivable_payment"'));
    // The others are only marked checked, after the transaction, with no lock.
    const last = fake.sent.at(-1)!;
    expect(last.sql).toMatch(/^update "receivable" set "updated_at" = \$1, "carried_checked" = \$2 where/);
    expect(s.filter((x) => x === "begin")).toHaveLength(1);
  });

  it("takes no lock for an invoice its list does not say is paid, nor for one no longer issued", async () => {
    vi.spyOn(repo, "figuresOne").mockResolvedValue(figures({ invoice: { ...invoice, status: "credited" } as InvoiceRecord }));
    await repo.carryOver(COMPANY, [{ invoiceId: INV, paid: true }, { invoiceId: "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6b", paid: false }], () => []);
    expect(steps().some((s) => s.startsWith("lock") || s === "begin")).toBe(false);
  });
});

describe("chasing (notes, promises, disputes, reminders)", () => {
  it("writes under the company's lock with its event, without the version", async () => {
    fake.answer = (sql) => (sql.startsWith('update "receivable"') ? [rowOf(receivableTable, { id: "rec-1", invoiceId: INV, version: 3 })] : []);
    const row = await repo.chase(COMPANY, INV, { promisedOn: "2026-11-25" }, { action: "promised" });
    expect(row).toMatchObject({ version: 3 });
    expect(steps()).toEqual(["begin", `lock ${COMPANY_LOCK}`, 'update "receivable" set', 'insert into "receivable_event"', "commit"]);
    const update = fake.sent.find((x) => x.sql.startsWith('update "receivable"'))!;
    expect(setPart(update.sql)).not.toContain('"version"');
    expect(update.params).toContain("2026-11-25");
  });

  it("never lowers the reminder level, and moves the last reminded day only on", async () => {
    fake.answer = (sql) => (sql.startsWith('update "receivable"') ? [rowOf(receivableTable, { id: "rec-1", invoiceId: INV })] : []);
    await repo.chase(COMPANY, INV, { reminderLevel: 1, lastRemindedOn: "2026-11-18" }, { action: "reminded" });
    const update = fake.sent.find((x) => x.sql.startsWith('update "receivable"'))!;
    expect(update.sql).toContain('"reminder_level" = greatest("receivable"."reminder_level", $');
    expect(update.sql).toContain('"last_reminded_on" = greatest("receivable"."last_reminded_on", $');
    expect(setPart(update.sql)).not.toContain('"version"');
  });

  it("rolls back what it wrote when the invoice has no receivable, and answers null", async () => {
    const work = vi.fn(async () => {});
    await expect(repo.chase(COMPANY, INV, {}, { action: "note_added" }, work)).resolves.toBeNull();
    expect(work).toHaveBeenCalled();
    expect(steps().at(-1)).toBe("rollback");
    expect(steps()).not.toContain('insert into "receivable_event"');
  });
});

describe("the bell's reads", () => {
  it("reads the overdue invoices the oldest due first, before the cap", async () => {
    await repo.figures(COMPANY, { overdueOn: "2026-11-18" }, 2000);
    expect(fake.sent[0]!.sql).toMatch(/order by "invoice"\."due_date" asc, "invoice"\."issue_date" asc, "invoice"\."id" asc limit \$\d+$/);
  });

  it("keeps the list's order elsewhere (the owed first, then the newest)", async () => {
    await repo.figures(COMPANY, { openOrSince: null }, 2001);
    expect(fake.sent[0]!.sql).toContain('<> 0) desc, "invoice"."issue_date" desc');
  });

  it("reads the paid invoices by the latest payment noted first, before the cap", async () => {
    await repo.paidSince(COMPANY, new Date("2026-11-11T10:00:00Z"));
    expect(fake.sent[0]!.sql).toMatch(/group by "receivable_payment"\."invoice_id" order by max\("receivable_payment"\."created_at"\) desc, "receivable_payment"\."invoice_id" asc limit \$\d+$/);
  });
});
