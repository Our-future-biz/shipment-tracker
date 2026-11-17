import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The master job a pre-alert's reading files its houses under (X6: read twice, it made a second
// master job with the same Master B/L), run against a stand-in for the database that records what
// is done, in order. What the statements do to real rows needs a database.
const fake = vi.hoisted(() => {
  const state = {
    found: [] as Record<string, unknown>[],
    steps: [] as string[],
    locks: [] as unknown[],
    reads: [] as { where: unknown; orderBy: unknown[] }[],
    inserted: [] as Record<string, unknown>[],
  };
  const run = (name: string) => ({
    execute: async (query: unknown) => {
      state.steps.push(`${name} lock`);
      state.locks.push(query);
    },
    select: () => ({
      from: () => ({
        where: (where: unknown) => ({
          orderBy: async (...orderBy: unknown[]) => {
            state.steps.push(`${name} read`);
            state.reads.push({ where, orderBy });
            return state.found;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: async () => {
          state.steps.push(`${name} insert`);
          state.inserted.push(row);
          return [{ id: "master-job-new", ...row }];
        },
      }),
    }),
  });
  const tx = run("tx");
  const db = {
    ...run("db"),
    transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
      state.steps.push("begin");
      const result = await work(tx);
      state.steps.push("commit");
      return result;
    },
  };
  const counter = {
    allocate: async (on: unknown) => {
      state.steps.push(on === tx ? "tx number" : "db number");
      return "MCZ99990009";
    },
  };
  return { state, db, counter };
});

vi.mock("../../db/db", () => ({ db: fake.db }));
vi.mock("../../repositories/shipmentRefCounter.repository", () => ({ shipmentRefCounterRepository: fake.counter }));

import { masterJobRepository } from "../../repositories/masterJob.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const KEPT = { id: "master-job-8", mczNumber: "MCZCONSOL99990008" };
const dialect = new PgDialect();
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};
const MBL_LOCK = { sql: "select pg_advisory_xact_lock(hashtext($1))", params: [`master-job-mbl:${COMPANY}:HLCUX6TEST001`] };
const LIVE_BY_KEY = {
  sql: `("master_job"."company_id" = $1 and "master_job"."deleted_at" is null and regexp_replace(upper("master_job"."master_bol_number"), $2, '', 'g') = $3)`,
  params: [COMPANY, "[^A-Z0-9]", "HLCUX6TEST001"],
};

beforeEach(() => {
  fake.state.found = [];
  fake.state.steps = [];
  fake.state.locks = [];
  fake.state.reads = [];
  fake.state.inserted = [];
});

describe("findOrCreateForMasterBol", () => {
  it("answers the live master job that has the Master B/L, however it is written, and creates nothing", async () => {
    fake.state.found = [KEPT];
    await expect(masterJobRepository.findOrCreateForMasterBol(COMPANY, "hlcu-x6test001", "jan@firma.cz")).resolves.toEqual({ row: KEPT, reused: true });
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "commit"]);
    expect(sent(fake.state.locks[0])).toEqual(MBL_LOCK);
    expect(sent(fake.state.reads[0]!.where)).toEqual(LIVE_BY_KEY);
    // The oldest, when dev data has the B/L twice.
    expect(fake.state.reads[0]!.orderBy.map((o) => sent(o).sql)).toEqual(['"master_job"."created_at" asc', '"master_job"."id" asc']);
  });

  it("else creates one under the next MCZ number holding the Master B/L - under the lock, in one transaction", async () => {
    await expect(masterJobRepository.findOrCreateForMasterBol(COMPANY, " HLCUX6TEST001 ", "jan@firma.cz")).resolves.toEqual({
      row: { id: "master-job-new", companyId: COMPANY, mczNumber: "MCZ99990009", createdBy: "jan@firma.cz", masterBolNumber: "HLCUX6TEST001" },
      reused: false,
    });
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "tx number", "tx insert", "commit"]);
  });
});

describe("liveByMasterBol", () => {
  it("finds the company's live master job by the Master B/L's key, and asks nothing for a B/L without letters or digits", async () => {
    fake.state.found = [KEPT];
    await expect(masterJobRepository.liveByMasterBol(COMPANY, "HLCUX6TEST001")).resolves.toEqual(KEPT);
    expect(sent(fake.state.reads[0]!.where)).toEqual(LIVE_BY_KEY);
    await expect(masterJobRepository.liveByMasterBol(COMPANY, " - ")).resolves.toBeNull();
    expect(fake.state.reads).toHaveLength(1);
  });
});
