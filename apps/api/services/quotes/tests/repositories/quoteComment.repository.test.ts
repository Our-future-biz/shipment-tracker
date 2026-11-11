import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The database can do nothing here: only the shape of the statements is checked.
vi.mock("../../db/db", () => ({ db: {} }));

import { threadAliveSql } from "../../repositories/quoteComment.repository";
import { REVISION_SUFFIX } from "../../lib/quoteNumberSql";
import { LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT, plainSalesReference, quoteThreadOf } from "../../../../lib/salesReference";

const sent = (piece: SQL) => new PgDialect().sqlToQuery(piece);

describe("a thread with a live quote", () => {
  // Was a pattern match (plain number = thread or LIKE thread || '-R%'), run against every quote of
  // the company for each message; now the quote's own thread compared by equality, which
  // quote_company_thread_idx answers.
  it("is one with a live quote of the company whose number belongs to the thread - deleted quotes leave no unread messages or mentions behind", () => {
    const { sql, params } = sent(threadAliveSql);
    // The quotes compared by their thread, as quoteThreadOf has it: without the letters of their
    // Freight Mode or a revision's suffix, so QCZLCL…001 and QCZ…001-R2 keep the thread QCZ…001 on the bell.
    expect(sql).toBe(
      'exists (select 1 from "quote" where "quote"."company_id" = "quote_comment"."company_id" and "quote"."deleted_at" is null and regexp_replace(regexp_replace("quote"."quote_number", $1, $2), $3, \'\') = "quote_comment"."thread_ref")',
    );
    expect(params).toEqual([LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT, REVISION_SUFFIX]);
  });

  it("puts each quote in the thread quoteThreadOf gives it: the original, its revisions, its letters - and a variant in its own", () => {
    // The SQL's steps, done the way Postgres's regexp_replace does them (the first match).
    const threadInSql = (quoteNumber: string) => plainSalesReference(quoteNumber).replace(new RegExp(REVISION_SUFFIX), "");
    const numbers = ["QCZ20261109001", "QCZLCL20261109001", "QCZ20261109001-R2", "QCZAIR20261109001-R12", "QCZ20261109001-3", "QCZRAIL20261109001-3-R1", "OLD-REF-7"];
    for (const quoteNumber of numbers) expect(threadInSql(quoteNumber), quoteNumber).toBe(quoteThreadOf(quoteNumber));
    expect(numbers.map(threadInSql)).toEqual([
      "QCZ20261109001",
      "QCZ20261109001",
      "QCZ20261109001",
      "QCZ20261109001",
      "QCZ20261109001-3",
      "QCZ20261109001-3",
      "OLD-REF-7",
    ]);
  });
});
