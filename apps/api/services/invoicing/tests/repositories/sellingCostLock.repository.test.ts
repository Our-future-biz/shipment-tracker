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
        where: () => ({
          returning: async () => {
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
