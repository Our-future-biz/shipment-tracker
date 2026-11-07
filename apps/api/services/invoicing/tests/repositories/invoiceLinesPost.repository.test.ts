import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// An invoice read line by line is written in one transaction under the shipments' trucking-lines
// locks: the locks first, then the Trucking check, then the repeat of its invoice number and the
// estimates it can go onto, read in the same transaction, then the writes. Run against stand-ins that
// record what is done, in order; what the statements do to real rows needs a database.
const fake = vi.hoisted(() => {
  const state = {
    steps: [] as string[],
    earlier: [] as { shipmentId: string; category: string }[],
    open: [] as { id: string; shipmentId: string; category: string }[],
    // Estimate rows someone typed a real cost on after they were read: the update finds them no longer open.
    takenMeanwhile: new Set<string>(),
    wheres: [] as { what: string; where: SQL }[],
    updated: [] as { id: string; values: Record<string, unknown> }[],
    inserted: [] as Record<string, unknown>[],
  };
  const read = (what: string, rows: () => unknown[]) => ({
    from: () => ({
      where: (where: SQL) => {
        state.wheres.push({ what, where });
        const result = Promise.resolve().then(() => {
          state.steps.push(`read ${what}`);
          return rows();
        });
        return Object.assign(result, { orderBy: () => result, groupBy: () => result, limit: () => result });
      },
    }),
  });
  const tx = {
    select: (fields: Record<string, unknown> = {}) =>
      !Object.keys(fields).length
        ? read("line", () => [])
        : "last" in fields
        ? read("sort order", () => [])
        : "id" in fields
          ? read("estimates", () => state.open)
          : read("invoice number", () => state.earlier),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: async () => {
            state.steps.push("update");
            state.wheres.push({ what: "update", where });
            const id = state.open.find((o) => new PgDialect().sqlToQuery(where).params.includes(o.id))?.id;
            if (!id || state.takenMeanwhile.has(id)) return [];
            state.updated.push({ id, values });
            return [{ id }];
          },
        }),
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>[]) => {
        state.steps.push("insert");
        state.inserted.push(...values);
      },
    }),
  };
  return { state, tx };
});

vi.mock("../../db/db", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fake.tx),
    select: (fields?: Record<string, unknown>) => fake.tx.select(fields),
  },
}));
vi.mock("../../repositories/truckingLines.repository", () => ({
  truckingLinesLock: vi.fn(async (_tx: unknown, shipmentId: string) => {
    fake.state.steps.push(`lock ${shipmentId}`);
  }),
}));

import { invoiceCostRepository } from "../../repositories/invoiceCost.repository";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
const row = (shipmentId: string, category = "ocean_freight", realAmount = "100.00") => ({ shipmentId, category, description: "OCEAN FREIGHT", realAmount, realCurrency: "USD" });
const check = async () => {
  fake.state.steps.push("check");
};
const opts = (over: Partial<Parameters<typeof invoiceCostRepository.addInvoiceRows>[3]> = {}) => ({ vendor: "GLOBELINK", fillEstimates: true, allowRepeat: false, check, ...over });
const sqlOf = (what: string) => new PgDialect().sqlToQuery(fake.state.wheres.find((w) => w.what === what)!.where);

beforeEach(() => {
  Object.assign(fake.state, { steps: [], earlier: [], open: [], takenMeanwhile: new Set(), wheres: [], updated: [], inserted: [] });
});

describe("posting an invoice read line by line", () => {
  it("takes the locks in one order, checks, then reads the repeat and the estimates in the transaction, then writes", async () => {
    fake.state.open = [{ id: "est-b", shipmentId: B, category: "ocean_freight" }];
    await expect(invoiceCostRepository.addInvoiceRows("c1", "AS260707595", [row(B), row(A)], opts())).resolves.toEqual({ ontoEstimate: [true, false] });
    expect(fake.state.steps).toEqual([`lock ${A}`, `lock ${B}`, "check", "read invoice number", "read estimates", "update", "read sort order", "insert"]);
  });

  it("puts the real cost on the open estimate, with the invoice number and the mark, and keeps the estimate's words", async () => {
    fake.state.open = [{ id: "est-a", shipmentId: A, category: "ocean_freight" }];
    await invoiceCostRepository.addInvoiceRows("c1", "AS260707595", [row(A)], opts());
    expect(fake.state.updated).toHaveLength(1);
    expect(fake.state.updated[0]!.values).toMatchObject({ realAmount: "100.00", realCurrency: "USD", invoiceNumber: "AS260707595", postedFromLines: true, vendor: "GLOBELINK" });
    expect(fake.state.updated[0]!.values).not.toHaveProperty("description");
    expect(fake.state.inserted).toEqual([]);
    // Written only while it is still open: an estimate, no real cost, no invoice number, entered here.
    const { sql } = sqlOf("update");
    expect(sql).toContain('"est_amount" is not null');
    expect(sql).toContain('"real_amount" is null');
    expect(sql).toContain("btrim(\"invoice_cost\".\"invoice_number\") = ''");
    expect(sql).toContain('"source_trucking_ref" is null');
    expect(sql).toContain('"source_master_job_ref" is null');
  });

  it("adds a new row when the estimate was given a real cost meanwhile", async () => {
    fake.state.open = [{ id: "est-a", shipmentId: A, category: "ocean_freight" }];
    fake.state.takenMeanwhile.add("est-a");
    await expect(invoiceCostRepository.addInvoiceRows("c1", "AS260707595", [row(A)], opts())).resolves.toEqual({ ontoEstimate: [false] });
    expect(fake.state.inserted).toEqual([expect.objectContaining({ shipmentId: A, realAmount: "100.00", invoiceNumber: "AS260707595", postedFromLines: true, companyId: "c1" })]);
  });

  it("never fills an estimate with a credit note's minus", async () => {
    fake.state.open = [{ id: "est-a", shipmentId: A, category: "ocean_freight" }];
    await invoiceCostRepository.addInvoiceRows("c1", "CN-1", [row(A, "ocean_freight", "-50.00")], opts({ fillEstimates: false }));
    expect(fake.state.steps).not.toContain("read estimates");
    expect(fake.state.updated).toEqual([]);
    expect(fake.state.inserted).toEqual([expect.objectContaining({ realAmount: "-50.00", postedFromLines: true })]);
  });

  it("refuses the same invoice under the same charge, read under the locks, before writing anything", async () => {
    fake.state.earlier = [{ shipmentId: A, category: "ocean_freight" }];
    await expect(invoiceCostRepository.addInvoiceRows("c1", "as 2607 07595", [row(A)], opts())).resolves.toBe("repeated");
    expect(fake.state.steps).toEqual([`lock ${A}`, "check", "read invoice number"]);
    // The number is compared without spaces or case.
    const { sql, params } = sqlOf("invoice number");
    expect(sql).toContain("upper(regexp_replace(\"invoice_cost\".\"invoice_number\", '[[:space:]]+', '', 'g'))");
    expect(params).toContain("AS260707595");
  });

  it("posts it again when allowed, without reading the repeat", async () => {
    fake.state.earlier = [{ shipmentId: A, category: "ocean_freight" }];
    await invoiceCostRepository.addInvoiceRows("c1", "AS260707595", [row(A)], opts({ allowRepeat: true }));
    expect(fake.state.steps).not.toContain("read invoice number");
    expect(fake.state.steps).toContain("insert");
  });

  it("refuses a Trucking cost found under the locks before reading or writing anything", async () => {
    const kept = async () => {
      throw new Error("Job CZ00000001 has its road freight cost from Trucking");
    };
    await expect(invoiceCostRepository.addInvoiceRows("c1", "X1", [row(A)], opts({ check: kept }))).rejects.toThrow("Trucking");
    expect(fake.state.steps).toEqual([`lock ${A}`]);
  });
});

describe("the line a cost posted by charge code goes onto", () => {
  it("is never a row of an invoice or credit note read line by line", async () => {
    await invoiceCostRepository.findByCategory(A, "c1", "ocean_freight");
    const { sql, params } = new PgDialect().sqlToQuery(fake.state.wheres.at(-1)!.where);
    expect(sql).toMatch(/"posted_from_lines" = \$\d+/);
    expect(params).toContain(false);
  });
});
