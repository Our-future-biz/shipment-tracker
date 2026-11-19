import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// The quotes that follow on from an original offer (a variant -2, a revision -R1), against the
// quotes database: while one is live, the original is not deleted (salesPolicy quoteDeletePermission).
// Runs only under `encore test` with QUOTES_DB_TESTS=1 (the Encore runtime opens the database):
//   QUOTES_DB_TESTS=1 encore test services/quotes/tests/db/quoteFollowUps.db.test.ts
describe.skipIf(!process.env.QUOTES_DB_TESTS)("the follow-ups of an original offer, in the database", () => {
  it("finds a live variant or revision under any letters, not a deleted one, nor a quote whose number only begins the same", async () => {
    const { db } = await import("../../db/db");
    const { salesQuoteRepository } = await import("../../repositories/salesQuote.repository");
    const { quoteTable } = await import("../../schemas/quote.schema");
    const { eq } = await import("drizzle-orm");
    const company = randomUUID();
    try {
      await db.insert(quoteTable).values([
        // Copied: its variant was made under other letters.
        { companyId: company, quoteNumber: "QCZFCL20261105003", status: "draft" },
        { companyId: company, quoteNumber: "QCZLCL20261105003-2", status: "draft" },
        // Revised.
        { companyId: company, quoteNumber: "QCZLCL20261105004", status: "draft" },
        { companyId: company, quoteNumber: "QCZLCL20261105004-R1", status: "revised" },
        // Its only copy was deleted: nothing follows on from it any more.
        { companyId: company, quoteNumber: "QCZAIR20261105005", status: "draft" },
        { companyId: company, quoteNumber: "QCZAIR20261105005-2", status: "draft", deletedAt: new Date() },
        // Begins like 006 without being of it.
        { companyId: company, quoteNumber: "QCZ20261105006", status: "draft" },
        { companyId: company, quoteNumber: "QCZ202611050061", status: "draft" },
      ]);
      const found = await salesQuoteRepository.liveFollowUps(company, [
        "QCZFCL20261105003",
        "QCZLCL20261105004",
        "QCZAIR20261105005",
        "QCZ20261105006",
        "QCZLCL20261105003-2",
      ]);
      expect(Object.fromEntries(found)).toEqual({
        QCZFCL20261105003: "QCZLCL20261105003-2",
        QCZLCL20261105004: "QCZLCL20261105004-R1",
      });
      // Another company's quotes are never counted.
      expect((await salesQuoteRepository.liveFollowUps(randomUUID(), ["QCZFCL20261105003"])).size).toBe(0);
    } finally {
      await db.delete(quoteTable).where(eq(quoteTable.companyId, company));
    }
  });
});
