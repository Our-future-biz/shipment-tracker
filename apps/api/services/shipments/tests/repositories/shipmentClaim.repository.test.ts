import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The claims on costs Accounts Payable reads, run against a stand-in for the database that records
// the statement. What it does to real rows is not checked here - that needs a database.
const fake = vi.hoisted(() => {
  const state = { reads: [] as { fields: Record<string, unknown>; joinOn: unknown; where: unknown; orderBy: unknown[] }[], found: [] as unknown[] };
  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        innerJoin: (_table: unknown, joinOn: unknown) => ({
          where: (where: unknown) => ({
            orderBy: async (...orderBy: unknown[]) => {
              state.reads.push({ fields, joinOn, where, orderBy });
              return state.found;
            },
          }),
        }),
      }),
    }),
  };
  return { state, db };
});
vi.mock("../../db/db", () => ({ db: fake.db }));

import { shipmentClaimRepository } from "../../repositories/shipmentClaim.repository";
import { shipmentClaimTable } from "../../schemas/shipmentClaim.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const INVOICE = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";
const dialect = new PgDialect();
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};
const LIVE_COST =
  '"shipment_claim"."company_id" = $1 and "shipment_claim"."kind" = $2 and "shipment_claim"."deleted_at" is null and "shipment"."company_id" = $3 and "shipment"."deleted_at" is null';

beforeEach(() => {
  fake.state.reads = [];
  fake.state.found = [];
});

describe("listCostClaims", () => {
  it("reads the company's live claims on costs of live shipments on any of the shipments or against any of the invoices, the oldest first", async () => {
    fake.state.found = [{ claim: { id: "claim-1" } }];
    await expect(shipmentClaimRepository.listCostClaims(COMPANY, [SHIPMENT], [INVOICE])).resolves.toEqual([{ id: "claim-1" }]);
    const [read] = fake.state.reads;
    expect(read!.fields).toEqual({ claim: shipmentClaimTable });
    expect(sent(read!.joinOn).sql).toBe('"shipment"."id" = "shipment_claim"."shipment_id"');
    expect(sent(read!.where)).toEqual({
      sql: `(${LIVE_COST} and ("shipment_claim"."shipment_id" in ($4) or "shipment_claim"."supplier_invoice_id" in ($5)))`,
      params: [COMPANY, "cost", COMPANY, SHIPMENT, INVOICE],
    });
    expect(read!.orderBy.map((o) => sent(o).sql)).toEqual(['"shipment_claim"."created_at" asc', '"shipment_claim"."id" asc']);
  });

  it("matches only the list it is given", async () => {
    await shipmentClaimRepository.listCostClaims(COMPANY, [], [INVOICE]);
    expect(sent(fake.state.reads[0]!.where)).toEqual({ sql: `(${LIVE_COST} and "shipment_claim"."supplier_invoice_id" in ($4))`, params: [COMPANY, "cost", COMPANY, INVOICE] });
  });

  it("reads nothing when it is given no ids", async () => {
    await expect(shipmentClaimRepository.listCostClaims(COMPANY, [], [])).resolves.toEqual([]);
    expect(fake.state.reads).toEqual([]);
  });
});
