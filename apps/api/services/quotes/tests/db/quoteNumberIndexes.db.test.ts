import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";

// A quote's number without its letters, against the quotes database (migration 0019): the chat's
// threads stay alive as they did, and the planner answers the lookups from the new indexes. Runs
// only under `encore test` with QUOTES_DB_TESTS=1 (the Encore runtime opens the database):
//   QUOTES_DB_TESTS=1 encore test services/quotes/tests/db/quoteNumberIndexes.db.test.ts
describe.skipIf(!process.env.QUOTES_DB_TESTS)("a quote's number without its letters, in the database", () => {
  it("keeps a chat thread alive while a live quote of it exists - under other letters or as a revision, not deleted, not a variant", async () => {
    const { db } = await import("../../db/db");
    const { quoteCommentRepository } = await import("../../repositories/quoteComment.repository");
    const { quoteTable } = await import("../../schemas/quote.schema");
    const { quoteCommentTable } = await import("../../schemas/quoteComment.schema");
    const { eq } = await import("drizzle-orm");
    const company = randomUUID();
    try {
      await db.insert(quoteTable).values([
        { companyId: company, quoteNumber: "QCZLCL20261111001", status: "draft" },
        { companyId: company, quoteNumber: "QCZ20261111002-R1", status: "draft" },
        { companyId: company, quoteNumber: "QCZAIR20261111003", status: "draft", deletedAt: new Date() },
        { companyId: company, quoteNumber: "QCZ20261111004-2", status: "draft" },
      ]);
      const threads = ["QCZ20261111001", "QCZ20261111002", "QCZ20261111003", "QCZ20261111004", "QCZ20261111004-2"];
      const writer = randomUUID();
      await db.insert(quoteCommentTable).values(threads.map((threadRef) => ({ companyId: company, threadRef, quoteNumber: threadRef, authorId: writer, message: "Ready?" })));
      const unread = await quoteCommentRepository.unreadCounts(company, randomUUID());
      expect(unread.map((u) => u.threadRef).sort()).toEqual(["QCZ20261111001", "QCZ20261111002", "QCZ20261111004-2"]);
    } finally {
      await db.delete(quoteCommentTable).where(eq(quoteCommentTable.companyId, company));
      await db.delete(quoteTable).where(eq(quoteTable.companyId, company));
    }
  });

  it("answers a lookup by the plain number, a day's numbers and a thread's live quotes from their indexes", async () => {
    const { db } = await import("../../db/db");
    const { quoteTable } = await import("../../schemas/quote.schema");
    const { plainQuoteNumberSql, quoteThreadSql } = await import("../../lib/quoteNumberSql");
    const { sql } = await import("drizzle-orm");
    const company = randomUUID();
    // Planned as the repositories send them: the patterns and values as parameters.
    const plans = await db.transaction(async (tx) => {
      // A test database has too few quotes for an index to beat reading the table: only which index
      // the planner can use is asked.
      await tx.execute(sql`set local enable_seqscan = off`);
      const plan = async (query: SQL) => JSON.stringify((await tx.execute(sql`explain (format json) ${query}`)).rows);
      return {
        byNumber: await plan(sql`select 1 from ${quoteTable} where ${quoteTable.companyId} = ${company} and ${plainQuoteNumberSql(quoteTable.quoteNumber)} = ${"QCZ20261111001"}`),
        byDay: await plan(sql`select 1 from ${quoteTable} where ${quoteTable.companyId} = ${company} and ${plainQuoteNumberSql(quoteTable.quoteNumber)} like ${"QCZ20261111%"}`),
        byThread: await plan(
          sql`select 1 from ${quoteTable} where ${quoteTable.companyId} = ${company} and ${quoteTable.deletedAt} is null and ${quoteThreadSql(quoteTable.quoteNumber)} = ${"QCZ20261111001"}`,
        ),
      };
    });
    expect(plans.byNumber).toContain("quote_company_plain_number_idx");
    expect(plans.byDay).toContain("quote_company_plain_number_idx");
    expect(plans.byThread).toContain("quote_company_thread_idx");
  });
});
