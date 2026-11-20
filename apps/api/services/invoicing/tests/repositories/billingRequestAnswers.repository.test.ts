import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// User council B5: a change or a partial credit request the app took back (the invoice was credited or
// cancelled meanwhile; services/invoiceDocument stores why in its comment) is shown to whoever asked and
// under the managers' Answered. One the asker took back by hand (no comment) stays out. Read against a
// stand-in for the database that records each statement's condition; real rows need a database.
const fake = vi.hoisted(() => {
  const state = { wheres: [] as unknown[] };
  const chain = {
    from: () => chain,
    where: (where: unknown) => {
      state.wheres.push(where);
      return chain;
    },
    orderBy: () => chain,
    limit: async () => [],
  };
  return { state, db: { select: () => chain } };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { invoiceChangeRequestRepository } from "../../repositories/invoiceChangeRequest.repository";
import { creditNoteRequestRepository } from "../../repositories/creditNoteRequest.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "u-rep";
const dialect = new PgDialect();
const sent = (piece: unknown) => dialect.sqlToQuery(piece as SQL);

beforeEach(() => {
  fake.state.wheres = [];
});

describe.each([
  ["invoice change requests", "invoice_change_request", invoiceChangeRequestRepository],
  ["partial credit requests", "credit_note_request", creditNoteRequestRepository],
] as const)("%s", (_name, table, repo) => {
  const byTheApp = `("${table}"."status" = $N and "${table}"."comment" <> $N)`;
  const shape = (sql: string) => sql.replace(/\$\d+/g, "$N");

  it("the managers' list keeps a request the app took back, not one taken back by hand", async () => {
    await repo.list(COMPANY, new Date("2026-10-21T00:00:00Z"), 300);
    const { sql, params } = sent(fake.state.wheres[0]);
    expect(shape(sql)).toContain(`("${table}"."status" <> $N or ${byTheApp})`);
    expect(params).toEqual(expect.arrayContaining(["withdrawn", ""]));
  });

  it("the asker's bell answers include a request the app took back", async () => {
    await repo.answersFor(COMPANY, USER, new Date("2026-10-21T00:00:00Z"), new Date("2026-11-13T00:00:00Z"), 100);
    const { sql, params } = sent(fake.state.wheres[0]);
    expect(shape(sql)).toMatch(/"status" in \(\$N, \$N(, \$N)?\) or /);
    expect(shape(sql)).toContain(` or ${byTheApp})`);
    expect(params).toEqual(expect.arrayContaining(["approved", "rejected", "withdrawn", ""]));
  });
});
