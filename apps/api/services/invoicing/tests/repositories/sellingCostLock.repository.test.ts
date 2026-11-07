import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// A selling row on an issued invoice is never written: the check and the write are one transaction,
// under the same trucking-lines lock an invoice issue takes, the lock first. Run against stand-ins
// that record what is done, in order; what the statements do to real rows needs a database.
const fake = vi.hoisted(() => {
  const state = { steps: [] as string[], invoiced: new Set<string>(), where: null as unknown };
  const tx = {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (w: unknown) => ({
          returning: async () => {
            state.where = w;
            state.steps.push("update");
            return [{ id: "row", ...values }];
          },
        }),
      }),
    }),
  };
  return { state, tx };
});

vi.mock("../../db/db", () => ({ db: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fake.tx) } }));
vi.mock("../../repositories/truckingLines.repository", () => ({
  truckingLinesLock: vi.fn(async () => {
    fake.state.steps.push("lock");
  }),
}));
vi.mock("../../repositories/invoice.repository", () => ({
  invoiceRepository: {
    invoicedSellingRowIds: vi.fn(async (_shipmentId: string, _companyId: string, reader: unknown) => {
      fake.state.steps.push(reader === fake.tx ? "read in the transaction" : "read outside");
      return fake.state.invoiced;
    }),
  },
}));

import { sellingCostRepository } from "../../repositories/sellingCost.repository";

beforeEach(() => {
  fake.state.steps = [];
  fake.state.invoiced = new Set();
});

describe("writing a selling row unless it is invoiced", () => {
  it("takes the lock, then reads what is invoiced in the same transaction, then writes", async () => {
    await expect(sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { data: { amount: "200.00" } })).resolves.toMatchObject({ amount: "200.00" });
    expect(fake.state.steps).toEqual(["lock", "read in the transaction", "update"]);
  });

  it("writes nothing to a row on an issued invoice, a delete included", async () => {
    fake.state.invoiced = new Set(["row"]);
    await expect(sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { data: { amount: "200.00" } })).resolves.toBe("invoiced");
    await expect(sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { delete: true })).resolves.toBe("invoiced");
    expect(fake.state.steps).not.toContain("update");
  });
});

describe("a row a master job's split keeps", () => {
  const written = () => new PgDialect().sqlToQuery(fake.state.where as SQL).sql;

  it("takes how it is billed: put on the invoice, its own text, its VAT code", async () => {
    await sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { data: { invoice: true, customer: "Demurrage", vatCode: null } });
    expect(written()).not.toContain('"source_master_job_ref" is null');
    expect(written()).toContain('"source_trucking_ref" is null');
  });

  it("is taken off the invoice only by a manager: billed for nothing, as a deletion would", async () => {
    await sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { data: { invoice: false } });
    expect(written()).toContain('"source_master_job_ref" is null');
    await sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { data: { invoice: false } }, { mayUntickSplit: true });
    expect(written()).not.toContain('"source_master_job_ref" is null');
  });

  it("keeps the split's charge and amount: any other write doesn't reach it", async () => {
    await sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { data: { invoice: false, amount: "10.00" } });
    expect(written()).toContain('"source_master_job_ref" is null');
    await sellingCostRepository.writeUnlessInvoiced("row", "c1", "s1", { delete: true });
    expect(written()).toContain('"source_master_job_ref" is null');
  });
});

describe("which invoices hold their rows", () => {
  it("only an issued invoice: a credited one, a draft or a credit note frees them", async () => {
    vi.resetModules();
    vi.doUnmock("../../repositories/invoice.repository");
    const { invoiceRepository } = await vi.importActual<typeof import("../../repositories/invoice.repository")>("../../repositories/invoice.repository");
    let where: SQL | undefined;
    const reader = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: async (w: SQL) => ((where = w), []) }) }) }),
    };
    await invoiceRepository.invoicedSellingRowIds("s1", "c1", reader as never);
    const { sql, params } = new PgDialect().sqlToQuery(where!);
    expect(sql).toMatch(/"kind" = \$\d+/);
    expect(sql).toMatch(/"status" = \$\d+/);
    expect(params).toEqual(expect.arrayContaining(["invoice", "issued", "c1", "s1"]));
  });
});
