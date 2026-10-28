import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

// The statements a draft is saved, approved, thrown away and has its ports picked with, and some of
// the reads of its rows, run against a stand-in for the database that records what is done, in
// order: the company's rows only, and the locks that keep two users from interleaving.
const fake = vi.hoisted(() => {
  const state = {
    steps: [] as string[],
    selects: [] as { table: unknown; where: unknown; lock: string | null }[],
    inserts: [] as { table: unknown; values: unknown }[],
    updates: [] as { table: unknown; values: Record<string, unknown>; where: unknown }[],
    deletes: [] as { table: unknown; where: unknown }[],
    /** What each select, insert or update returns, in turn; one past the list returns nothing. */
    returned: [] as unknown[][],
  };
  const next = () => state.returned.shift() ?? [];
  const run = (name: string) => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (where: unknown) => {
          const entry = { table, where, lock: null as string | null };
          state.selects.push(entry);
          return {
            for: async (lock: string) => {
              state.steps.push(`${name} select for ${lock}`);
              entry.lock = lock;
              return next();
            },
            then: (resolve: (rows: unknown[]) => unknown, reject: (err: unknown) => unknown) => {
              state.steps.push(`${name} select`);
              return Promise.resolve(next()).then(resolve, reject);
            },
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        state.inserts.push({ table, values });
        return {
          returning: async () => {
            state.steps.push(`${name} insert`);
            return next();
          },
        };
      },
    }),
    delete: (table: unknown) => ({
      where: async (where: unknown) => {
        state.steps.push(`${name} delete`);
        state.deletes.push({ table, where });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => ({
          returning: async () => {
            state.steps.push(`${name} update`);
            state.updates.push({ table, values, where });
            return next();
          },
        }),
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
  return { state, db };
});

vi.mock("../db/db", () => ({ db: fake.db }));

import type { RailLayout } from "../interfaces/interfaces";
import { tariffRepository, type DraftFields } from "../repositories/tariff.repository";
import { collectionAreaTable, collectionRateTable, oceanPortTable, railRateTable, tariffTable, tariffVersionTable } from "../schemas/tariff.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const TARIFF = "00000000-0000-0000-0000-0000000000a1";
const VERSION = "00000000-0000-0000-0000-0000000000b1";

const dialect = new PgDialect();
/** A piece of a statement as Postgres gets it: its text and its parameters. */
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};

const LAYOUT: RailLayout = {
  sheet: "Road",
  headerRow: 3,
  firstDataRow: 4,
  lastDataRow: null,
  columns: { country: "A", postcode: "B", place: "C", region: null, via: "D", emptyDepot: "D", note: null, validFrom: null, validTo: null },
  bands: [],
  currency: "EUR",
  validFrom: "2026-01-01",
  validTo: null,
  defaultCountry: "CZ",
  conditions: [],
  links: [],
  name: "Hamburg – Czechia",
};
const FIELDS: DraftFields = { currency: "EUR", layout: LAYOUT, layoutSource: "ai" };

beforeEach(() => {
  fake.state.steps = [];
  fake.state.selects = [];
  fake.state.inserts = [];
  fake.state.updates = [];
  fake.state.deletes = [];
  fake.state.returned = [];
});

describe("createDraft", () => {
  it("numbers the draft after the last version under the company's locked live tariff", async () => {
    fake.state.returned = [[{ id: TARIFF }], [{ last: 3 }], [{ id: VERSION, versionNo: 4 }]];
    await expect(tariffRepository.createDraft(COMPANY, { tariffId: TARIFF }, FIELDS, [])).resolves.toEqual({ id: VERSION, versionNo: 4 });

    expect(fake.state.steps).toEqual(["begin", "tx select for update", "tx select", "tx insert", "commit"]);
    const lock = fake.state.selects[0]!;
    expect(lock.table).toBe(tariffTable);
    expect(sent(lock.where)).toEqual({
      sql: '("tariff"."id" = $1 and "tariff"."company_id" = $2 and "tariff"."deleted_at" is null)',
      params: [TARIFF, COMPANY],
    });
    expect(sent(fake.state.selects[1]!.where)).toEqual({
      sql: '("tariff_version"."company_id" = $1 and "tariff_version"."tariff_id" = $2)',
      params: [COMPANY, TARIFF],
    });
    expect(fake.state.inserts[0]!.values).toMatchObject({ companyId: COMPANY, tariffId: TARIFF, versionNo: 4, status: "draft" });
  });

  it("refuses a tariff that is not the company's live one and saves nothing", async () => {
    fake.state.returned = [[]];
    await expect(tariffRepository.createDraft(COMPANY, { tariffId: TARIFF }, FIELDS, [])).rejects.toMatchObject({ code: "not_found" });
    expect(fake.state.inserts).toEqual([]);
    expect(fake.state.steps).not.toContain("commit");
  });
});

describe("approve", () => {
  const draft = { id: VERSION, companyId: COMPANY, tariffId: TARIFF, status: "draft", deletedAt: null, errorCount: 0, validFrom: "2026-01-01", validTo: null };

  it("locks the company's tariff and version, and refuses a draft with port names still to match", async () => {
    fake.state.returned = [[draft], [{ id: TARIFF }], [draft], [{ pending: 2 }]];
    await expect(tariffRepository.approve(COMPANY, VERSION, "Marek")).resolves.toEqual({
      ok: false,
      reason: "2 port names are not matched to a place yet: pick each one, or leave it out, first",
    });

    expect(fake.state.steps).toEqual(["begin", "tx select", "tx select for update", "tx select for update", "tx select", "commit"]);
    const [, tariffLock, versionLock, pending] = fake.state.selects;
    expect(sent(tariffLock!.where)).toEqual({ sql: '("tariff"."id" = $1 and "tariff"."company_id" = $2)', params: [TARIFF, COMPANY] });
    expect(sent(versionLock!.where)).toEqual({ sql: '("tariff_version"."id" = $1 and "tariff_version"."company_id" = $2)', params: [VERSION, COMPANY] });
    expect(pending!.table).toBe(oceanPortTable);
    expect(sent(pending!.where)).toEqual({
      sql: '("ocean_port"."company_id" = $1 and "ocean_port"."version_id" = $2 and "ocean_port"."status" = $3)',
      params: [COMPANY, VERSION, "pending"],
    });
    expect(fake.state.updates).toEqual([]);
  });
});

describe("discard", () => {
  it("soft-deletes the company's live draft with its update time", async () => {
    fake.state.returned = [[{ id: VERSION }]];
    await expect(tariffRepository.discard(COMPANY, VERSION)).resolves.toBe(true);
    const [discarded] = fake.state.updates;
    expect(discarded!.table).toBe(tariffVersionTable);
    expect(discarded!.values.deletedAt).toBeInstanceOf(Date);
    expect(discarded!.values.updatedAt).toEqual(discarded!.values.deletedAt);
    // Its rows of every kind go with it, the company's only, in the same transaction.
    expect(fake.state.deletes).toHaveLength(7);
    expect(fake.state.deletes[0]!.table).toBe(railRateTable);
    expect(sent(fake.state.deletes[0]!.where)).toEqual({ sql: '("rail_rate"."company_id" = $1 and "rail_rate"."version_id" = $2)', params: [COMPANY, VERSION] });
    for (const { where } of fake.state.deletes) expect(sent(where).params).toEqual([COMPANY, VERSION]);
    expect(fake.state.steps.at(-1)).toBe("commit");
  });
});

describe("setOceanPort", () => {
  it("picks the port only once the version is locked as the company's live draft", async () => {
    const picked = { versionId: VERSION, side: "pod", name: "HAMBURG", code: "DEHAM", status: "manual" };
    fake.state.returned = [[{ id: VERSION }], [picked]];
    await expect(tariffRepository.setOceanPort(COMPANY, VERSION, "pod", "HAMBURG", "DEHAM")).resolves.toEqual({ ok: true, port: picked });

    expect(fake.state.steps).toEqual(["begin", "tx select for share", "tx update", "commit"]);
    expect(sent(fake.state.selects[0]!.where)).toEqual({
      sql: '("tariff_version"."id" = $1 and ("tariff_version"."company_id" = $2 and "tariff_version"."deleted_at" is null) and "tariff_version"."status" = $3)',
      params: [VERSION, COMPANY, "draft"],
    });
    expect(fake.state.updates[0]!.values).toEqual({ code: "DEHAM", status: "manual" });
    expect(sent(fake.state.updates[0]!.where)).toEqual({
      sql: '("ocean_port"."company_id" = $1 and "ocean_port"."version_id" = $2 and "ocean_port"."side" = $3 and "ocean_port"."name" = $4)',
      params: [COMPANY, VERSION, "pod", "HAMBURG"],
    });
  });

  it("changes nothing on a version approved or discarded meanwhile, and says so", async () => {
    fake.state.returned = [[]];
    await expect(tariffRepository.setOceanPort(COMPANY, VERSION, "pod", "HAMBURG", null)).resolves.toEqual({ ok: false, reason: "not_draft" });
    expect(fake.state.updates).toEqual([]);
  });

  it("tells a port name the draft does not have", async () => {
    fake.state.returned = [[{ id: VERSION }], []];
    await expect(tariffRepository.setOceanPort(COMPANY, VERSION, "pod", "NOWHERE", null)).resolves.toEqual({ ok: false, reason: "no_such_name" });
  });
});

describe("reading a version's rows", () => {
  it("counts the company's port names still to match", async () => {
    fake.state.returned = [[{ n: 2 }]];
    await expect(tariffRepository.pendingOceanPorts(COMPANY, VERSION)).resolves.toBe(2);
    expect(sent(fake.state.selects[0]!.where)).toEqual({
      sql: '("ocean_port"."company_id" = $1 and "ocean_port"."version_id" = $2 and "ocean_port"."status" = $3)',
      params: [COMPANY, VERSION, "pending"],
    });
  });

  it("counts a collections version's rows of every kind within the company", async () => {
    fake.state.returned = [[{ n: 3 }], [{ n: 0 }], [{ n: 0 }], [{ n: 5 }]];
    await expect(tariffRepository.collectionCounts(COMPANY, VERSION)).resolves.toEqual({ rates: 3, regions: 0, distances: 0, areas: 5 });
    expect(fake.state.selects.map((q) => q.table)).toContain(collectionRateTable);
    expect(fake.state.selects.map((q) => q.table)).toContain(collectionAreaTable);
    for (const { where } of fake.state.selects) expect(sent(where).params).toEqual([COMPANY, VERSION]);
  });
});
