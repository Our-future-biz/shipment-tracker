import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// shipmentRepository.followQuoteRename against a stand-in for the database that records what is
// done, in order, and answers the locked read with the rows it is given - the rows that still name
// the quote under another spelling. What the statements do to real rows needs a database.
const fake = vi.hoisted(() => {
  const state = {
    /** What the locked read returns: the shipments that still differ. */
    naming: [] as { id: string; jobNumber: string; salesNumber: string }[],
    steps: [] as string[],
    reads: [] as { where: unknown; lock: string }[],
    updates: [] as { values: Record<string, unknown>; where: unknown }[],
    inserted: [] as Record<string, unknown>[][],
  };
  const tx = {
    select: () => ({
      from: () => ({
        where: (where: unknown) => ({
          for: async (lock: string) => {
            state.steps.push("read");
            state.reads.push({ where, lock });
            return state.naming;
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: unknown) => {
          state.steps.push("update");
          state.updates.push({ values, where });
        },
      }),
    }),
    insert: () => ({
      values: async (rows: Record<string, unknown>[]) => {
        state.steps.push("history");
        state.inserted.push(rows);
      },
    }),
  };
  const db = {
    transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
      state.steps.push("begin");
      const result = await work(tx);
      state.steps.push("commit");
      return result;
    },
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));
vi.mock("../../repositories/shipmentRefCounter.repository", () => ({ shipmentRefCounterRepository: {} }));

import { LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT } from "../../../../lib/salesReference";
import { shipmentRepository } from "../../repositories/shipment.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SERVICE_USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a99";
const FROM = "QCZ20261111002";
const TO = "QCZROAD20261111002";

const dialect = new PgDialect();
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};

beforeEach(() => {
  fake.state.naming = [];
  fake.state.steps = [];
  fake.state.reads = [];
  fake.state.updates = [];
  fake.state.inserted = [];
});

describe("followQuoteRename", () => {
  it("names the quote anew on every shipment that names it under another spelling, each with one history line, old → new", async () => {
    fake.state.naming = [
      { id: "shipment-1", jobNumber: "CZFCL00000101", salesNumber: FROM },
      { id: "shipment-2", jobNumber: "CZFCL00000102", salesNumber: "QCZFCL20261111002" },
    ];
    await expect(shipmentRepository.followQuoteRename(COMPANY, FROM, TO, SERVICE_USER)).resolves.toEqual(["CZFCL00000101", "CZFCL00000102"]);
    expect(fake.state.steps).toEqual(["begin", "read", "update", "history", "commit"]);
    expect(fake.state.updates[0]!.values).toEqual({ salesNumber: TO });
    expect(sent(fake.state.updates[0]!.where)).toEqual({ sql: '("shipment"."company_id" = $1 and "shipment"."id" in ($2, $3))', params: [COMPANY, "shipment-1", "shipment-2"] });
    expect(fake.state.inserted).toEqual([
      [
        { companyId: COMPANY, shipmentId: "shipment-1", userId: SERVICE_USER, field: "salesNumber", oldValue: FROM, newValue: TO },
        { companyId: COMPANY, shipmentId: "shipment-2", userId: SERVICE_USER, field: "salesNumber", oldValue: "QCZFCL20261111002", newValue: TO },
      ],
    ]);
  });

  it("reads, locked, only the company's shipments that name the quote - without its letters - and do not hold the new reference yet", async () => {
    await shipmentRepository.followQuoteRename(COMPANY, FROM, TO, SERVICE_USER);
    const [read] = fake.state.reads;
    expect(read!.lock).toBe("update");
    expect(sent(read!.where)).toEqual({
      sql: '("shipment"."company_id" = $1 and regexp_replace("shipment"."sales_number", $2, $3) = $4 and "shipment"."sales_number" <> $5)',
      params: [COMPANY, LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT, FROM, TO],
    });
  });

  it("writes nothing - no second history line - when the event comes again and every shipment already names the quote as it is", async () => {
    // The first delivery moved them: the locked read finds none that still differs.
    fake.state.naming = [];
    await expect(shipmentRepository.followQuoteRename(COMPANY, FROM, TO, SERVICE_USER)).resolves.toEqual([]);
    expect(fake.state.steps).toEqual(["begin", "read", "commit"]);
    expect(fake.state.updates).toEqual([]);
    expect(fake.state.inserted).toEqual([]);
  });
});
