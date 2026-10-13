import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The repository is run against a stand-in for the database that records what is done, in order.
// What the statements do to real rows is not checked here - that needs a database.
const fake = vi.hoisted(() => {
  const state = {
    steps: [] as string[],
    executed: [] as unknown[],
    /** The number sales_import_followup_tasks reports. */
    imported: 0 as number | undefined,
    /** What a read of the list returns: its rows, and the number its count reports. */
    listed: [] as Record<string, unknown>[],
    total: 0 as number | string,
    /** Every read of the list: its condition, order and window. */
    pages: [] as { where: unknown; orderBy: unknown[]; limit?: number; offset?: number }[],
    /** The condition of every count. */
    counts: [] as unknown[],
  };
  const run = (name: string) => ({
    execute: async (query: unknown) => {
      state.steps.push(`${name} execute`);
      state.executed.push(query);
      return { rows: state.imported === undefined ? [] : [{ imported: state.imported }] };
    },
    select: (fields?: Record<string, unknown>) => ({
      from: () => ({
        where: (where: unknown) => {
          if (fields) {
            state.steps.push(`${name} count`);
            state.counts.push(where);
            return Promise.resolve([{ value: state.total }]);
          }
          const page: (typeof state.pages)[number] = { where, orderBy: [] };
          const chain = {
            orderBy: (...order: unknown[]) => {
              page.orderBy = order;
              return chain;
            },
            limit: (limit: number) => {
              page.limit = limit;
              return chain;
            },
            offset: (offset: number) => {
              page.offset = offset;
              return chain;
            },
            then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
              state.steps.push(`${name} list`);
              state.pages.push(page);
              return Promise.resolve(state.listed).then(resolve, reject);
            },
          };
          return chain;
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
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { followupTaskRepository } from "../../repositories/followupTask.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const AFTER = "5c1d3b5e-0c58-4a57-8e0b-3a1f4d2e9b10";

const dialect = new PgDialect();
/** A piece of a statement as Postgres gets it: its text and its parameters. */
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};
const LIVE = '"followup_task"."company_id" = $1 and "followup_task"."deleted_at" is null';
const PAGE_ORDER = [
  '"followup_task"."done_at" is not null',
  '"followup_task"."done_at" desc',
  '"followup_task"."due_date" asc nulls last',
  '"followup_task"."created_at" asc',
  '"followup_task"."legacy_index" asc',
  '"followup_task"."id" asc',
];

beforeEach(() => {
  fake.state.steps = [];
  fake.state.executed = [];
  fake.state.imported = 0;
  fake.state.listed = [];
  fake.state.total = 0;
  fake.state.pages = [];
  fake.state.counts = [];
});

describe("importLegacy", () => {
  it("takes the lock on the company's import, then calls the copy - in one transaction - and returns how many tasks were copied", async () => {
    fake.state.imported = 11;
    await expect(followupTaskRepository.importLegacy(COMPANY)).resolves.toBe(11);
    expect(fake.state.steps).toEqual(["begin", "tx execute", "tx execute", "commit"]);
    // A lock that ends with the transaction, on the import of this company alone.
    expect(sent(fake.state.executed[0])).toEqual({ sql: "select pg_advisory_xact_lock(hashtext($1))", params: [`followup-import:${COMPANY}`] });
    expect(sent(fake.state.executed[1])).toEqual({ sql: "select sales_import_followup_tasks($1::uuid) as imported", params: [COMPANY] });
  });

  it("returns 0 when nothing was copied", async () => {
    await expect(followupTaskRepository.importLegacy(COMPANY)).resolves.toBe(0);
    fake.state.imported = undefined;
    await expect(followupTaskRepository.importLegacy(COMPANY)).resolves.toBe(0);
  });
});

describe("list", () => {
  const page = { limit: 50, offset: 0 };

  it("reads the company's live tasks and counts them with the same condition", async () => {
    fake.state.listed = [{ id: "task-1" }];
    fake.state.total = "7";
    await expect(followupTaskRepository.list(COMPANY, {}, page)).resolves.toEqual({ rows: [{ id: "task-1" }], total: 7 });
    expect(sent(fake.state.pages[0]!.where)).toEqual({ sql: `(${LIVE})`, params: [COMPANY] });
    expect(sent(fake.state.counts[0])).toEqual({ sql: `(${LIVE})`, params: [COMPANY] });
  });

  it("orders a page: open tasks by due day with the undated last, done tasks by when they were done, then by creation, old position and id", async () => {
    await followupTaskRepository.list(COMPANY, {}, { limit: 20, offset: 40 });
    const [read] = fake.state.pages;
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(PAGE_ORDER);
    expect(read).toMatchObject({ limit: 20, offset: 40 });
  });

  it("narrows to the tasks of one user, or to those assigned to nobody", async () => {
    await followupTaskRepository.list(COMPANY, { assigneeUserId: USER }, page);
    expect(sent(fake.state.pages[0]!.where)).toEqual({ sql: `(${LIVE} and "followup_task"."assignee_user_id" = $2)`, params: [COMPANY, USER] });
    await followupTaskRepository.list(COMPANY, { assigneeUserId: null }, page);
    expect(sent(fake.state.pages[1]!.where)).toEqual({ sql: `(${LIVE} and "followup_task"."assignee_user_id" is null)`, params: [COMPANY] });
  });

  it("narrows to the open tasks, or to the done ones", async () => {
    await followupTaskRepository.list(COMPANY, { done: false }, page);
    expect(sent(fake.state.pages[0]!.where).sql).toBe(`(${LIVE} and "followup_task"."done_at" is null)`);
    await followupTaskRepository.list(COMPANY, { done: true }, page);
    expect(sent(fake.state.pages[1]!.where).sql).toBe(`(${LIVE} and "followup_task"."done_at" is not null)`);
    await followupTaskRepository.list(COMPANY, { assigneeUserId: USER, done: false }, page);
    expect(sent(fake.state.pages[2]!.where)).toEqual({
      sql: `(${LIVE} and "followup_task"."assignee_user_id" = $2 and "followup_task"."done_at" is null)`,
      params: [COMPANY, USER],
    });
  });

  it("with afterId reads the rows after that id in id order, without an offset - and still counts the whole filter", async () => {
    fake.state.total = 450;
    await expect(followupTaskRepository.list(COMPANY, { done: false }, { limit: 200, offset: 0, afterId: AFTER })).resolves.toMatchObject({ total: 450 });
    const [read] = fake.state.pages;
    expect(sent(read!.where)).toEqual({
      sql: `((${LIVE} and "followup_task"."done_at" is null) and "followup_task"."id" > $2)`,
      params: [COMPANY, AFTER],
    });
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(['"followup_task"."id" asc']);
    expect(read!.limit).toBe(200);
    expect(read!.offset).toBeUndefined();
    // The count is of the filter alone: it stays the same while a caller walks through the list.
    expect(sent(fake.state.counts[0])).toEqual({ sql: `(${LIVE} and "followup_task"."done_at" is null)`, params: [COMPANY] });
  });
});
