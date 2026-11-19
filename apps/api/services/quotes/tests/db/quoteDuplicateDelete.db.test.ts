import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// Duplicate and delete of the same quote at one moment, against the quotes database: the copy is made with the
// quote copied from locked (salesQuoteRepository.createVariantOf), so a delete that went first leaves nothing to
// copy, and one that comes second finds the copy and is refused - no copy is left without its original.
// Runs only under `encore test` with QUOTES_DB_TESTS=1 (the Encore runtime opens the database):
//   QUOTES_DB_TESTS=1 encore test services/quotes/tests/db/quoteDuplicateDelete.db.test.ts
describe.skipIf(!process.env.QUOTES_DB_TESTS)("duplicating a quote while it is deleted, in the database", () => {
  const BASE = "QCZ20261119001";
  const build = () => ({ status: "draft" }) as never;
  const next = (existing: string[]) => `${BASE}-${existing.length + 1}`;

  it("copies a live quote under its next variant, and the original then has a follow-up", async () => {
    const { db } = await import("../../db/db");
    const { salesQuoteRepository } = await import("../../repositories/salesQuote.repository");
    const { quoteTable } = await import("../../schemas/quote.schema");
    const { eq } = await import("drizzle-orm");
    const company = randomUUID();
    try {
      await db.insert(quoteTable).values({ companyId: company, quoteNumber: BASE, status: "draft" });
      const copy = await salesQuoteRepository.createVariantOf(company, BASE, `${BASE}-`, next, build);
      expect(copy?.quoteNumber).toBe(`${BASE}-1`);
      expect((await salesQuoteRepository.liveFollowUps(company, [BASE])).get(BASE)).toBe(`${BASE}-1`);
    } finally {
      await db.delete(quoteTable).where(eq(quoteTable.companyId, company));
    }
  });

  it("makes no copy of a quote deleted while the copy waited for it", async () => {
    const { db } = await import("../../db/db");
    const { salesQuoteRepository } = await import("../../repositories/salesQuote.repository");
    const { quoteTable } = await import("../../schemas/quote.schema");
    const { and, eq } = await import("drizzle-orm");
    const company = randomUUID();
    try {
      await db.insert(quoteTable).values({ companyId: company, quoteNumber: BASE, status: "draft" });
      let copying: Promise<unknown> | null = null;
      // The delete holds the quote locked (as salesQuoteService.delete does); the copy starts meanwhile and waits.
      await salesQuoteRepository.withLockedQuote(company, BASE, async (_quote, tx) => {
        copying = salesQuoteRepository.createVariantOf(company, BASE, `${BASE}-`, next, build);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await tx.update(quoteTable).set({ deletedAt: new Date() }).where(and(eq(quoteTable.companyId, company), eq(quoteTable.quoteNumber, BASE)));
      });
      expect(await copying).toBeNull();
      const rows = await db.select({ quoteNumber: quoteTable.quoteNumber }).from(quoteTable).where(eq(quoteTable.companyId, company));
      expect(rows.map((r) => r.quoteNumber)).toEqual([BASE]);
    } finally {
      await db.delete(quoteTable).where(eq(quoteTable.companyId, company));
    }
  });
});
