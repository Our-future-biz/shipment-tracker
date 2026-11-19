import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The writes of the customer's invoice list that Invoicing and Accounts Receivable send, run against a stand-in for
// the database that records each step in order. What the statements do to real rows is not checked here.
const fake = vi.hoisted(() => {
  const state = {
    /** What each read finds, in order. */
    found: [] as Record<string, unknown>[][],
    steps: [] as { op: string; set?: Record<string, unknown>; values?: Record<string, unknown>; where?: SQL; lock?: string; sql?: SQL }[],
  };
  const read = () => {
    const step: { op: string; where?: SQL; lock?: string } = { op: "select" };
    const chain = {
      from: () => chain,
      where: (where: SQL) => ((step.where = where), chain),
      orderBy: () => chain,
      limit: () => chain,
      for: (mode: string) => ((step.lock = mode), chain),
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        state.steps.push(step);
        return Promise.resolve(state.found.shift() ?? []).then(ok, ko);
      },
    };
    return chain;
  };
  const tx = {
    execute: async (sql: SQL) => {
      state.steps.push({ op: "execute", sql });
      return [];
    },
    select: () => read(),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          state.steps.push({ op: "insert", values });
          return [{ id: "new", ...values }];
        },
      }),
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          state.steps.push({ op: "update", set, where });
          return Object.assign(Promise.resolve(undefined), { returning: async () => [{ id: "e1", ...set }] });
        },
      }),
    }),
  };
  const db = { ...tx, transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerInvoiceRepository } from "../../repositories/customerInvoice.repository";

const dialect = new PgDialect();
const text = (s: SQL) => dialect.sqlToQuery(s);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const CUSTOMER = "0b6a1c1e-1111-4a4a-8a8a-0000000000cc";
const INVOICE = "0b6a1c1e-1111-4a4a-8a8a-0000000000a1";
const created = new Date("2026-11-01T08:00:00Z");
const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1", companyId: COMPANY, customerId: CUSTOMER, invoiceNumber: "INV-1", amount: 1000, currency: "EUR", status: "Open", source: "invoicing",
  invoiceId: INVOICE, leftToPay: null, paidOn: null, createdAt: created, ...over,
});
const word = (over: Record<string, unknown> = {}) => ({
  customerId: CUSTOMER, invoiceId: INVOICE, invoiceNumber: "INV-1", leftToPay: 0, lastPaidOn: "2026-11-17", settled: true, creditNoteNumbers: [] as string[], ...over,
});
const updates = () => fake.state.steps.filter((s) => s.op === "update");
const locks = () => fake.state.steps.filter((s) => s.op === "execute").map((s) => text(s.sql!).params[0]);

beforeEach(() => {
  fake.state.found = [];
  fake.state.steps = [];
});

describe("Accounts Receivable's word on an invoice's entry (applyReceivable)", () => {
  it("makes a settled invoice Paid, with what is left and the last payment day, under the lock of its number and of its row", async () => {
    fake.state.found = [[entry()]];
    await expect(customerInvoiceRepository.applyReceivable(COMPANY, word())).resolves.toBe(true);
    expect(locks()).toEqual([`customer-invoice:${COMPANY}:INV-1`]);
    expect(fake.state.steps.find((s) => s.op === "select")).toMatchObject({ lock: "update" });
    expect(updates()).toHaveLength(1);
    expect(updates()[0]!.set).toMatchObject({ status: "Paid", leftToPay: 0, paidOn: "2026-11-17", source: "invoicing", invoiceId: INVOICE });
    expect(text(updates()[0]!.where!).params).toEqual(["e1"]);
  });

  it("puts a Paid invoice back to Open after a take-back", async () => {
    fake.state.found = [[entry({ status: "Paid", leftToPay: 0 })]];
    await customerInvoiceRepository.applyReceivable(COMPANY, word({ leftToPay: 400, lastPaidOn: null, settled: false }));
    expect(updates()[0]!.set).toMatchObject({ status: "Open", leftToPay: 400, paidOn: null });
  });

  it("leaves an old Paid that Accounts Receivable never wrote to as it is (a partial credit note's word before the carry-over)", async () => {
    fake.state.found = [[entry({ status: "Paid", leftToPay: null })]];
    await expect(customerInvoiceRepository.applyReceivable(COMPANY, word({ leftToPay: 790, lastPaidOn: null, settled: false, creditNoteNumbers: ["CN-1"] }))).resolves.toBe(true);
    // Only the partial credit note's entry is written (it owes nothing on its own); the invoice's Paid stands.
    expect(updates()).toHaveLength(1);
    expect(updates()[0]!.set).toEqual(expect.objectContaining({ leftToPay: 0 }));
    expect(updates()[0]!.set).not.toHaveProperty("status");
  });

  it("makes a credited invoice's entry Credited, never Paid", async () => {
    fake.state.found = [[entry()]];
    await customerInvoiceRepository.applyReceivable(COMPANY, word({ leftToPay: -300, settled: true, invoiceStatus: "credited" }));
    expect(updates()[0]!.set).toMatchObject({ status: "Credited", leftToPay: -300 });
  });

  it("finds an entry that does not know the invoice's id yet by its customer and number, and gives it the id", async () => {
    fake.state.found = [[], [entry({ id: "typed", source: "typed", invoiceId: null })]];
    await expect(customerInvoiceRepository.applyReceivable(COMPANY, word())).resolves.toBe(true);
    const [byId, byNumber] = fake.state.steps.filter((s) => s.op === "select");
    expect(text(byId!.where!).sql).toContain('"customer_invoice"."invoice_id" = $');
    const q = text(byNumber!.where!);
    expect(q.sql).toContain('"customer_invoice"."customer_id" = $');
    expect(q.sql).toContain('"customer_invoice"."invoice_number" = $');
    expect(q.sql).toContain('"customer_invoice"."invoice_id" IS NULL OR');
    expect(q.params).toEqual(expect.arrayContaining([COMPANY, CUSTOMER, "INV-1", INVOICE]));
    expect(byNumber!.lock).toBe("update");
    expect(updates()[0]!.set).toMatchObject({ source: "invoicing", invoiceId: INVOICE, status: "Paid" });
  });

  it("never touches a Credited invoice", async () => {
    fake.state.found = [[entry({ status: "Credited" })]];
    await expect(customerInvoiceRepository.applyReceivable(COMPANY, word())).resolves.toBe(true);
    expect(updates()).toHaveLength(0);
  });

  it("sets the entries of the invoice's partial credit notes to owe nothing (netted into the invoice), never a Credited or Cancelled one", async () => {
    fake.state.found = [[entry()]];
    await customerInvoiceRepository.applyReceivable(COMPANY, word({ leftToPay: 500, settled: false, creditNoteNumbers: ["CN-2", "CN-1"] }));
    // Every number locked, always in the same order.
    expect(locks()).toEqual([`customer-invoice:${COMPANY}:CN-1`, `customer-invoice:${COMPANY}:CN-2`, `customer-invoice:${COMPANY}:INV-1`]);
    expect(updates()).toHaveLength(2);
    const [, creditNotes] = updates();
    expect(creditNotes!.set).toMatchObject({ leftToPay: 0, source: "invoicing" });
    const q = text(creditNotes!.where!);
    expect(q.sql).toContain('"customer_invoice"."invoice_number" in ($');
    expect(q.sql).toContain('"customer_invoice"."status" not in ($');
    expect(q.sql).toContain('"customer_invoice"."deleted_at" is null');
    expect(q.params).toEqual(expect.arrayContaining([COMPANY, CUSTOMER, "CN-2", "CN-1", "Credited", "Cancelled"]));
  });

  it("writes nothing and says so (false, not an error) when the invoice has no live entry", async () => {
    fake.state.found = [[], []];
    await expect(customerInvoiceRepository.applyReceivable(COMPANY, word({ creditNoteNumbers: ["CN-1"] }))).resolves.toBe(false);
    expect(updates()).toHaveLength(0);
  });

  it("changes nothing more when the same word comes again", async () => {
    fake.state.found = [[entry({ status: "Paid", leftToPay: 0, paidOn: "2026-11-17" })]];
    await customerInvoiceRepository.applyReceivable(COMPANY, word());
    expect(updates()[0]!.set).toMatchObject({ status: "Paid", leftToPay: 0, paidOn: "2026-11-17" });
  });
});

describe("an issued document posted to the customer's list (upsertIssued)", () => {
  const values = { customerId: CUSTOMER, invoiceNumber: "INV-1", amount: 1000, currency: "EUR", dueDate: "2026-12-01", status: "Open" as const, issuedAt: "2026-11-01" };

  it("is added as posted by Invoicing, with the document's id", async () => {
    fake.state.found = [[]];
    await customerInvoiceRepository.upsertIssued(COMPANY, { ...values, invoiceId: INVOICE });
    expect(locks()).toEqual([`customer-invoice:${COMPANY}:INV-1`]);
    expect(fake.state.steps.find((s) => s.op === "insert")!.values).toMatchObject({ source: "invoicing", invoiceId: INVOICE, companyId: COMPANY });
  });

  it("makes a typed entry of the same number posted by Invoicing with the issued status: a Paid typed ahead of the invoice is not kept", async () => {
    fake.state.found = [[entry({ source: "typed", invoiceId: null, status: "Paid", leftToPay: 0 })]];
    await customerInvoiceRepository.upsertIssued(COMPANY, values);
    const set = updates()[0]!.set!;
    expect(set).toMatchObject({ source: "invoicing", amount: 1000, status: "Open" });
    expect(set).not.toHaveProperty("leftToPay");
    expect(set).not.toHaveProperty("invoiceId");
  });

  it("sent again, leaves the status set since and what Accounts Receivable sent", async () => {
    fake.state.found = [[entry({ source: "invoicing", status: "Paid", leftToPay: 0 })]];
    await customerInvoiceRepository.upsertIssued(COMPANY, values);
    const set = updates()[0]!.set!;
    expect(set).toMatchObject({ source: "invoicing", amount: 1000 });
    expect(set).not.toHaveProperty("status");
    expect(set).not.toHaveProperty("leftToPay");
  });
});

describe("the entries of issued documents (entriesOfIssued)", () => {
  it("finds them by the document's id, else by customer and number, and marks those not yet marked as posted", async () => {
    const OTHER = "0b6a1c1e-1111-4a4a-8a8a-0000000000a2";
    fake.state.found = [
      [entry()],
      [entry({ id: "e2", invoiceNumber: "INV-2", source: "typed", invoiceId: null }), entry({ id: "e3", invoiceNumber: "INV-2", invoiceId: INVOICE })],
    ];
    const found = await customerInvoiceRepository.entriesOfIssued(COMPANY, [
      { invoiceId: INVOICE, customerId: CUSTOMER, number: "INV-1" },
      { invoiceId: OTHER, customerId: CUSTOMER, number: "INV-2" },
    ]);
    expect(found.get(INVOICE)?.id).toBe("e1");
    // e3 names another document: not this one.
    expect(found.get(OTHER)).toMatchObject({ id: "e2", source: "invoicing", invoiceId: OTHER });
    const marks = fake.state.steps.filter((s) => s.op === "execute");
    expect(marks).toHaveLength(1);
    const q = text(marks[0]!.sql!);
    expect(q.sql).toContain("set source = 'invoicing', invoice_id = v.invoice_id");
    expect(q.params).toEqual(["e2", OTHER, COMPANY]);
  });
});
