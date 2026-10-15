import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The repository is run against a stand-in for a transaction that records what is written. What
// the statement does to real rows is not checked here - that needs a database.
const fake = vi.hoisted(() => {
  const state = { updates: [] as { set: Record<string, unknown>; where: unknown }[] };
  const tx = {
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async (where: unknown) => {
          state.updates.push({ set, where });
        },
      }),
    }),
  };
  return { state, tx };
});

// The database outside the transaction can do nothing here: a write that went around the
// transaction - and so would not be part of the quote's deletion - fails the test.
vi.mock("../../db/db", () => ({ db: {} }));

import { quoteAttachmentRepository } from "../../repositories/quoteAttachment.repository";
import type { QuoteTransaction } from "../../repositories/salesQuote.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const AT = new Date("2026-10-10T10:00:00.000Z");
const tx = fake.tx as unknown as QuoteTransaction;

beforeEach(() => {
  fake.state.updates = [];
});

describe("deleteForQuote", () => {
  it("deletes the live attachments of that quote of that company - through the transaction, stamped with the moment given", async () => {
    await quoteAttachmentRepository.deleteForQuote(tx, "QCZ20261010001", COMPANY, AT);
    expect(fake.state.updates).toHaveLength(1);
    const { set, where } = fake.state.updates[0]!;
    expect(set).toEqual({ deletedAt: AT, updatedAt: AT });
    const { sql, params } = new PgDialect().sqlToQuery(where as SQL);
    expect(sql).toBe('("quote_attachment"."company_id" = $1 and "quote_attachment"."quote_number" = $2 and "quote_attachment"."deleted_at" is null)');
    expect(params).toEqual([COMPANY, "QCZ20261010001"]);
  });
});
