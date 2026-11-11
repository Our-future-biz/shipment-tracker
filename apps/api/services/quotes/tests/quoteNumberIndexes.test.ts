import { describe, expect, it, vi } from "vitest";
import { is, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

// The database can do nothing here: the indexes and statements are compared as written.
vi.mock("../db/db", () => ({ db: {} }));

import { quoteTable } from "../schemas/quote.schema";
import { plainQuoteNumberSql, quoteThreadSql } from "../lib/quoteNumberSql";
import { threadAliveSql } from "../repositories/quoteComment.repository";

const dialect = new PgDialect();

/** An index of the quote table as the migration creates it: its columns and expressions, and its condition. */
function indexOf(name: string) {
  const index = getTableConfig(quoteTable).indexes.find((i) => i.config.name === name);
  if (!index) throw new Error(`no index ${name}`);
  return {
    on: index.config.columns.map((column) => (is(column, SQL) ? dialect.sqlToQuery(column, "indexes").sql : (column as { name: string }).name)),
    where: index.config.where ? dialect.sqlToQuery(index.config.where).sql : null,
  };
}

/**
 * A statement as Postgres plans it: the values of its parameters in place (node-postgres sends an
 * unnamed statement, planned with them), its columns without their table as an index names them.
 */
function asPlanned(piece: SQL): string {
  const { sql, params } = dialect.sqlToQuery(piece);
  return sql.replace(/\$(\d+)/g, (_, n: string) => `'${String(params[Number(n) - 1]).replaceAll("'", "''")}'`).replaceAll('"quote".', "");
}

describe("the indexes of a quote's number without its letters", () => {
  it("index the plain number as the lookups write it, for = and LIKE 'prefix%' alike", () => {
    const plain = asPlanned(plainQuoteNumberSql(quoteTable.quoteNumber));
    expect(plain).toBe(`regexp_replace("quote_number", '^QCZ(RAIL|ROAD|AIR|FCL|LCL|BB)([0-9]{8})', 'QCZ\\2')`);
    expect(indexOf("quote_company_plain_number_idx")).toEqual({ on: ["company_id", `${plain} text_pattern_ops`], where: null });
  });

  it("index the live quotes' thread as the chat's unread counts compare it", () => {
    const thread = asPlanned(quoteThreadSql(quoteTable.quoteNumber));
    expect(thread).toBe(`regexp_replace(regexp_replace("quote_number", '^QCZ(RAIL|ROAD|AIR|FCL|LCL|BB)([0-9]{8})', 'QCZ\\2'), '-R[0-9]+$', '')`);
    expect(indexOf("quote_company_thread_idx")).toEqual({ on: ["company_id", thread], where: "deleted_at IS NULL" });
    // The condition the index holds is the query's own, so the planner may use it.
    expect(asPlanned(threadAliveSql)).toContain(`"deleted_at" is null and ${thread} = "quote_comment"."thread_ref"`);
  });
});
