import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// A rename and the quote-renamed event it owes, against the quotes database (migration 0018). Runs
// only under `encore test` with QUOTES_DB_TESTS=1 (the Encore runtime opens the database):
//   QUOTES_DB_TESTS=1 encore test services/quotes/tests/db/quoteRename.db.test.ts
describe.skipIf(!process.env.QUOTES_DB_TESTS)("a quote's rename and its event", () => {
  it("writes the event with the rename, in its transaction, and nothing for a quote that is gone", async () => {
    const { db } = await import("../../db/db");
    const { quoteRenameRepository } = await import("../../repositories/quoteRename.repository");
    const { quoteEventOutboxTable } = await import("../../schemas/quoteEventOutbox.schema");
    const { quoteTable } = await import("../../schemas/quote.schema");
    const { eq } = await import("drizzle-orm");
    const company = randomUUID();
    await db.insert(quoteTable).values({ companyId: company, quoteNumber: "QCZ20261111001", status: "draft", data: { reference: "QCZ20261111001" } });
    const renamed = await quoteRenameRepository.rename(company, "QCZ20261111001", "QCZAIR20261111001");
    expect(renamed).toMatchObject({ quoteNumber: "QCZAIR20261111001", data: { reference: "QCZAIR20261111001" } });
    const owed = await db.select().from(quoteEventOutboxTable).where(eq(quoteEventOutboxTable.companyId, company));
    expect(owed).toMatchObject([{ quoteId: renamed!.id, status: "pending", event: { companyId: company, from: "QCZ20261111001", to: "QCZAIR20261111001" } }]);
    // The old reference is no live quote any more: nothing renamed, nothing owed.
    expect(await quoteRenameRepository.rename(company, "QCZ20261111001", "QCZSEA20261111001")).toBeNull();
    expect(await db.select().from(quoteEventOutboxTable).where(eq(quoteEventOutboxTable.companyId, company))).toHaveLength(1);
    await db.delete(quoteEventOutboxTable).where(eq(quoteEventOutboxTable.companyId, company));
    await db.delete(quoteTable).where(eq(quoteTable.companyId, company));
  });
});
