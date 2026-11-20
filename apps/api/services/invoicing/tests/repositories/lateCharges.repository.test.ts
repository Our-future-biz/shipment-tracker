import { beforeEach, describe, expect, it, vi } from "vitest";

// The read behind Invoicing → To bill's jobs with a charge added after their invoice (User Council B4, owner's answer
// Q9), down to the statement Postgres gets: the query builder is the real one, over a stand-in for the connection that
// keeps the SQL it is handed. What the statement finds in real rows is tests/db/operationsMoney.db.test.ts.
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
vi.mock("../../repositories/truckingLines.repository", () => ({ truckingLinesLock: vi.fn() }));

import { invoiceRepository } from "../../repositories/invoice.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

beforeEach(() => {
  fake.sent.length = 0;
});

/** The one statement a read sent. */
const sent = () => {
  expect(fake.sent).toHaveLength(1);
  return fake.sent[0]!;
};

describe("the jobs with a charge added after their invoice (lateChargeShipmentIds)", () => {
  it("is the credit-owed read with the sign turned: an open invoice, a live row above nothing on no document billing now", async () => {
    await invoiceRepository.lateChargeShipmentIds(COMPANY, 1000);
    const late = sent();
    fake.sent.length = 0;
    await invoiceRepository.creditOwedShipmentIds(COMPANY, 1000);
    const owed = sent();
    expect(late.sql).toContain("coalesce(sc.amount, 0) * coalesce(sc.qty, 1) > 0");
    expect(owed.sql).toContain("coalesce(sc.amount, 0) * coalesce(sc.qty, 1) < 0");
    // Otherwise one rule: the same job (an issued invoice), the same "on no open invoice nor partial credit note of one".
    expect(late.sql.replace("> 0", "< 0")).toBe(owed.sql);
    expect(late.sql).toContain("oi.kind = 'invoice' and oi.status = 'issued' and oi.deleted_at is null");
    expect(late.sql).toContain("and not exists (select 1 from \"invoice_line\" bl join \"invoice\" bd on bd.id = bl.invoice_id");
    expect(late.sql).toMatch(/group by sc\.shipment_id\s+order by max\(sc\.created_at\) desc\s+limit \$2$/);
    expect(late.params).toEqual([COMPANY, 1000]);
    // It only reads.
    expect(late.sql).not.toMatch(/\b(insert|update|delete|lock)\b/i);
  });
});
