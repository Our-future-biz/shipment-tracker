import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The database can do nothing here: only the shape of the statements is checked.
vi.mock("../../db/db", () => ({ db: {} }));

import { threadAliveSql } from "../../repositories/quoteComment.repository";

const sent = (piece: SQL) => new PgDialect().sqlToQuery(piece);

describe("a thread with a live quote", () => {
  it("is one whose original reference or one of its revisions is a live quote of the company - deleted quotes leave no unread messages or mentions behind", () => {
    const { sql, params } = sent(threadAliveSql);
    expect(sql).toBe(
      'exists (select 1 from "quote" where "quote"."company_id" = "quote_comment"."company_id" and "quote"."deleted_at" is null and ("quote"."quote_number" = "quote_comment"."thread_ref" or "quote"."quote_number" like "quote_comment"."thread_ref" || \'-R%\'))',
    );
    expect(params).toEqual([]);
  });
});
