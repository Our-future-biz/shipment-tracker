import { beforeEach, describe, expect, it, vi } from "vitest";

// The two reads the Money tab of Shipments → Managers adds to Accounts Payable's repository, down to the
// statement Postgres gets: the query builder is the real one, over a stand-in for the connection that keeps
// the SQL it is handed. What the statements find in real rows is tests/db/operationsMoney.db.test.ts.
const fake = vi.hoisted(() => ({ sent: [] as { sql: string; params: unknown[] }[] }));
vi.mock("../../db/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const connection = {
    query: async (query: string | { text: string }, params?: unknown[]) => {
      fake.sent.push({ sql: typeof query === "string" ? query : query.text, params: params ?? [] });
      return { rows: [], rowCount: 0, fields: [] };
    },
  };
  return { db: drizzle({ client: connection as never }) };
});

import { supplierInvoiceRepository as repo } from "../../repositories/supplierInvoice.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";

beforeEach(() => {
  fake.sent.length = 0;
});

/** The one statement a read sent. */
const sent = () => {
  expect(fake.sent).toHaveLength(1);
  return fake.sent[0]!;
};

describe("the supplier invoices on a set of jobs", () => {
  it("is one statement: the company's live invoices a live line of the jobs points to, and the refused ones whose kept lines were on them", async () => {
    await repo.listOfShipments(COMPANY, [A, B, A]);
    const { sql, params } = sent();
    expect(sql).toMatch(/^select .+ from "supplier_invoice" where /);
    expect(sql).toContain(
      'where (("supplier_invoice"."company_id" = $1 and "supplier_invoice"."deleted_at" is null) and (' +
        '"supplier_invoice"."id" in (select "supplier_invoice_id" from "invoice_cost" where ("invoice_cost"."company_id" = $2 and "invoice_cost"."deleted_at" is null and "invoice_cost"."supplier_invoice_id" is not null and "invoice_cost"."shipment_id" in ($3, $4)))' +
        ' or ("supplier_invoice"."status" = \'refused\' and exists (select 1 from jsonb_array_elements("supplier_invoice"."refused_lines") as "kept"("line") where "kept"."line"->>\'table\' = \'invoice_cost\' and "kept"."line"->>\'ownerId\' in ($5, $6)))))',
    );
    expect(params).toEqual([COMPANY, COMPANY, A, B, A, B]);
    // It only reads.
    expect(sql).not.toMatch(/\b(insert|update|delete|lock)\b/i);
  });

  it("sends nothing for no jobs", async () => {
    await expect(repo.listOfShipments(COMPANY, [])).resolves.toEqual([]);
    expect(fake.sent).toEqual([]);
  });
});

describe("the estimates of a set of jobs still waiting for an invoice", () => {
  it("is the Expected tab's own rule, for the jobs asked", async () => {
    await repo.expectedLinesOfShipments(COMPANY, [A, B]);
    const estimates = sent();
    fake.sent.length = 0;
    await repo.expectedLines(COMPANY, 1000);
    const expected = sent();
    // The same lines as the Expected tab reads: entered on the job, estimated, no real cost, no invoice number, a value.
    const rule =
      '"invoice_cost"."company_id" = $1 and "invoice_cost"."deleted_at" is null and "invoice_cost"."source_trucking_ref" is null and "invoice_cost"."source_master_job_ref" is null' +
      ' and "invoice_cost"."est_amount" is not null and "invoice_cost"."real_amount" is null and btrim("invoice_cost"."invoice_number") = \'\'' +
      ' and round("invoice_cost"."est_amount" * coalesce("invoice_cost"."est_qty", 1), 2) <> 0';
    expect(expected.sql).toContain(`where (${rule}) order by`);
    expect(estimates.sql).toContain(`where (${rule} and "invoice_cost"."shipment_id" in ($2, $3))`);
    expect(estimates.sql).not.toMatch(/ limit /);
    expect(estimates.params).toEqual([COMPANY, A, B]);
  });

  it("sends nothing for no jobs", async () => {
    await expect(repo.expectedLinesOfShipments(COMPANY, [])).resolves.toEqual([]);
    expect(fake.sent).toEqual([]);
  });
});
