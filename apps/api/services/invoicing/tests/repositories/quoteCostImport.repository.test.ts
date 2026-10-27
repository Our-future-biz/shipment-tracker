import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The repository is run against a stand-in for the database that records what is done, in order,
// and answers the reads of the two sides with what a test has laid out. What the statements do
// to real rows is not checked here - that needs a database.
const fake = vi.hoisted(() => {
  const state = {
    /** What the next reads of a side find, first come first served; nothing = an empty side. */
    sides: [] as { copied: string; quoted?: string; last: number | null }[],
    steps: [] as { did: string; table?: unknown }[],
    locks: [] as unknown[],
    reads: [] as { table: unknown; fields: Record<string, unknown>; where: unknown }[],
    updates: [] as { table: unknown; values: Record<string, unknown>; where: unknown }[],
    inserts: [] as { table: unknown; rows: Record<string, unknown>[] }[],
    upserts: [] as { table: unknown; row: Record<string, unknown>; conflict: Record<string, unknown> }[],
  };
  const tx = {
    execute: async (query: unknown) => {
      state.steps.push({ did: "lock" });
      state.locks.push(query);
    },
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: async (where: unknown) => {
          state.steps.push({ did: "read", table });
          state.reads.push({ table, fields, where });
          return [state.sides.shift() ?? { copied: "0", last: null }];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: unknown) => {
          state.steps.push({ did: "update", table });
          state.updates.push({ table, values, where });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({
        onConflictDoUpdate: async (conflict: Record<string, unknown>) => {
          state.steps.push({ did: "upsert", table });
          state.upserts.push({ table, row: values as Record<string, unknown>, conflict });
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          state.steps.push({ did: "insert", table });
          state.inserts.push({ table, rows: values as Record<string, unknown>[] });
          return Promise.resolve().then(resolve, reject);
        },
      }),
    }),
  };
  const db = {
    transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
      state.steps.push({ did: "begin" });
      const result = await work(tx);
      state.steps.push({ did: "commit" });
      return result;
    },
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { quoteCostImportRepository } from "../../repositories/quoteCostImport.repository";
import { billingSettingsTable } from "../../schemas/billingSettings.schema";
import type { QuoteBuyingRow, QuoteSellingRow } from "../../utils/quoteCostImport.utils";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const REF = "QCZ20261010001-2";

const dialect = new PgDialect();
/** A piece of a statement as Postgres gets it: its text and its parameters. */
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};
/** What was done, in order: "read invoice_cost", "insert invoice_selling_cost", ... */
const steps = () => fake.state.steps.map((step) => (step.table ? `${step.did} ${getTableName(step.table as Table)}` : step.did));

const buying = (category: string): QuoteBuyingRow => ({
  category,
  description: "",
  vendor: "Maersk",
  estQty: "1",
  estAmount: "2000.00",
  estCurrency: "USD",
  realQty: "1",
  realCurrency: "USD",
  unit: "",
});
const selling = (category: string): QuoteSellingRow => ({ category, description: "", customer: "ITTEC s.r.o.", qty: "1", amount: "2400.00", currency: "USD", invoice: true });
const BUYING = [buying("Ocean freight"), buying("THC Destination")];
const SELLING = [selling("Ocean freight")];

const copy = (rows: Parameters<typeof quoteCostImportRepository.copy>[3], again = false) => quoteCostImportRepository.copy(COMPANY, SHIPMENT, REF, rows, again);

beforeEach(() => {
  fake.state.sides = [];
  fake.state.steps = [];
  fake.state.locks = [];
  fake.state.reads = [];
  fake.state.updates = [];
  fake.state.inserts = [];
  fake.state.upserts = [];
});

describe("copy", () => {
  it("locks the shipment, looks at both sides, and only then writes - rows, then the quote reference - in one transaction", async () => {
    await expect(copy({ buying: BUYING, selling: SELLING })).resolves.toEqual({ buying: 2, selling: 1 });
    expect(steps()).toEqual([
      "begin",
      "lock",
      "read invoice_cost",
      "read invoice_selling_cost",
      "insert invoice_cost",
      "insert invoice_selling_cost",
      "upsert billing_settings",
      "commit",
    ]);
    // A lock that ends with the transaction, on this shipment alone.
    expect(sent(fake.state.locks[0])).toEqual({ sql: "select pg_advisory_xact_lock(hashtext($1))", params: [`import-quote:${SHIPMENT}`] });
  });

  it("asks each side how many of its rows came from the quote and where its rows end - of this company's shipment only", async () => {
    await copy({ buying: BUYING, selling: SELLING });
    const [cost, sellingCost] = fake.state.reads;
    expect(sent(cost!.fields.copied)).toEqual({ sql: 'count(*) filter (where "invoice_cost"."source_quote_number" = $1)', params: [REF] });
    expect(sent(cost!.fields.last).sql).toBe('max("invoice_cost"."sort_order")');
    // Live rows only: a deleted row neither counts as copied nor holds a place in the order.
    expect(sent(cost!.where)).toEqual({
      sql: '("invoice_cost"."company_id" = $1 and "invoice_cost"."shipment_id" = $2 and "invoice_cost"."deleted_at" is null)',
      params: [COMPANY, SHIPMENT],
    });
    expect(sent(sellingCost!.fields.copied).sql).toBe('count(*) filter (where "invoice_selling_cost"."source_quote_number" = $1)');
    expect(sent(sellingCost!.where)).toEqual({
      sql: '("invoice_selling_cost"."company_id" = $1 and "invoice_selling_cost"."shipment_id" = $2 and "invoice_selling_cost"."deleted_at" is null)',
      params: [COMPANY, SHIPMENT],
    });
  });

  it("writes every row under the caller's company and shipment, marked with the quote, in the quote's order after the rows that are there", async () => {
    fake.state.sides = [
      { copied: "0", last: 4 },
      { copied: "0", last: null },
    ];
    await copy({ buying: BUYING, selling: SELLING });
    const from = { companyId: COMPANY, shipmentId: SHIPMENT, sourceQuoteNumber: REF };
    expect(fake.state.inserts.map((insert) => insert.rows)).toEqual([
      [
        { ...BUYING[0], ...from, sortOrder: 5 },
        { ...BUYING[1], ...from, sortOrder: 6 },
      ],
      // An empty side starts at 0, as a row added by hand does.
      [{ ...SELLING[0], ...from, sortOrder: 0 }],
    ]);
  });

  it("leaves a side that already holds rows of the quote as it is, names it, and still copies the other side", async () => {
    // Postgres reports a count as text. The buying side holds the quote's rows, the selling side does not.
    fake.state.sides = [
      { copied: "2", last: 1 },
      { copied: "0", last: null },
    ];
    await expect(copy({ buying: BUYING, selling: SELLING })).resolves.toEqual({ buying: 0, selling: 1, alreadyCopied: ["buying"] });
    expect(steps()).toEqual(["begin", "lock", "read invoice_cost", "read invoice_selling_cost", "insert invoice_selling_cost", "upsert billing_settings", "commit"]);
  });

  it("is null, and writes nothing at all, when every side that is asked for already holds rows of the quote", async () => {
    fake.state.sides = [
      { copied: "2", last: 1 },
      { copied: "1", last: 0 },
    ];
    await expect(copy({ buying: BUYING, selling: SELLING })).resolves.toBeNull();
    expect(steps()).toEqual(["begin", "lock", "read invoice_cost", "read invoice_selling_cost", "commit"]);
  });

  it("is null too when the side left to copy has no lines in the quote", async () => {
    fake.state.sides = [
      { copied: "0", last: 1 },
      { copied: "2", last: 1 },
    ];
    await expect(copy({ buying: [], selling: SELLING })).resolves.toBeNull();
    expect(steps()).toEqual(["begin", "lock", "read invoice_cost", "read invoice_selling_cost", "commit"]);
  });

  it("copies again when told to, after the rows of the first copy", async () => {
    fake.state.sides = [
      { copied: "2", last: 1 },
      { copied: "1", last: 0 },
    ];
    await expect(copy({ buying: BUYING, selling: SELLING }, true)).resolves.toEqual({ buying: 2, selling: 1 });
    expect(fake.state.inserts.map((insert) => insert.rows.map((row) => row.sortOrder))).toEqual([[2, 3], [1]]);
  });

  it("neither reads nor writes the side that is not asked for - rows of the quote there do not count", async () => {
    await expect(copy({ buying: BUYING })).resolves.toEqual({ buying: 2, selling: 0 });
    expect(steps()).toEqual(["begin", "lock", "read invoice_cost", "insert invoice_cost", "upsert billing_settings", "commit"]);
    fake.state.steps = [];
    await expect(copy({ selling: SELLING })).resolves.toEqual({ buying: 0, selling: 1 });
    expect(steps()).toEqual(["begin", "lock", "read invoice_selling_cost", "insert invoice_selling_cost", "upsert billing_settings", "commit"]);
  });

  it("inserts nothing for a side without lines, and still records the quote on the shipment", async () => {
    await expect(copy({ buying: [], selling: SELLING })).resolves.toEqual({ buying: 0, selling: 1 });
    expect(steps()).toEqual(["begin", "lock", "read invoice_cost", "read invoice_selling_cost", "insert invoice_selling_cost", "upsert billing_settings", "commit"]);
  });

  it("asks the buying side how many of its rows came from any quote, and leaves a side that has none as it is", async () => {
    await copy({ buying: BUYING, selling: SELLING });
    const [cost] = fake.state.reads;
    expect(sent(cost!.fields.quoted)).toEqual({ sql: `count(*) filter (where "invoice_cost"."source_quote_number" <> '')`, params: [] });
    expect(steps()).not.toContain("update invoice_cost");
  });

  it("makes way for the new buying lines: an earlier quote's line with nothing of the user's on it goes, one with a real cost, an invoice or a receipt stays as a line of its own, without the estimate", async () => {
    fake.state.sides = [{ copied: "0", quoted: "2", last: 3 }];
    await expect(copy({ buying: BUYING })).resolves.toEqual({ buying: 2, selling: 0 });
    expect(steps()).toEqual(["begin", "lock", "read invoice_cost", "update invoice_cost", "update invoice_cost", "insert invoice_cost", "upsert billing_settings", "commit"]);
    const [gone, kept] = fake.state.updates;
    expect(gone!.values).toEqual({ deletedAt: expect.any(Date), updatedAt: expect.any(Date) });
    expect(sent(gone!.where)).toEqual({
      sql:
        '("invoice_cost"."company_id" = $1 and "invoice_cost"."shipment_id" = $2 and "invoice_cost"."deleted_at" is null and "invoice_cost"."source_trucking_ref" is null and "invoice_cost"."source_quote_number" <> \'\' and "invoice_cost"."real_amount" is null and "invoice_cost"."invoice_number" = $3 and "invoice_cost"."received" = $4)',
      params: [COMPANY, SHIPMENT, "", false],
    });
    expect(kept!.values).toEqual({ sourceQuoteNumber: "", estQty: null, estAmount: null, updatedAt: expect.any(Date) });
    expect(sent(kept!.where)).toEqual({
      sql: '("invoice_cost"."company_id" = $1 and "invoice_cost"."shipment_id" = $2 and "invoice_cost"."deleted_at" is null and "invoice_cost"."source_trucking_ref" is null and "invoice_cost"."source_quote_number" <> \'\')',
      params: [COMPANY, SHIPMENT],
    });
  });

  it("leaves the selling side's earlier copies as they are - those can be deleted by hand", async () => {
    fake.state.sides = [
      { copied: "0", quoted: "0", last: null },
      { copied: "1", quoted: "1", last: 0 },
    ];
    await expect(copy({ buying: BUYING, selling: SELLING }, true)).resolves.toEqual({ buying: 2, selling: 1 });
    expect(steps()).not.toContain("update invoice_selling_cost");
  });

  it("sets the quote reference of the shipment's one settings row of the caller's company and nothing else of it", async () => {
    await copy({ buying: BUYING });
    const [{ row, conflict }] = fake.state.upserts as [(typeof fake.state.upserts)[number]];
    expect(row).toEqual({ companyId: COMPANY, shipmentId: SHIPMENT, quoteRef: REF });
    // The settings row is unique per (company, shipment): another company's row is another row.
    expect(conflict.target).toEqual([billingSettingsTable.companyId, billingSettingsTable.shipmentId]);
    expect(conflict.set).toEqual({ quoteRef: REF, updatedAt: expect.any(Date), deletedAt: null });
  });
});
