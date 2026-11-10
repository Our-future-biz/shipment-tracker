import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The database can do nothing here: only the shape of the statements is checked.
vi.mock("../../db/db", () => ({ db: {} }));

import { threadAliveSql } from "../../repositories/quoteComment.repository";
import { LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT } from "../../../../lib/salesReference";

const sent = (piece: SQL) => new PgDialect().sqlToQuery(piece);

describe("a thread with a live quote", () => {
  it("is one whose original reference or one of its revisions is a live quote of the company - deleted quotes leave no unread messages or mentions behind", () => {
    const { sql, params } = sent(threadAliveSql);
    // The quotes compared without the letters of their Freight Mode: the thread has none (quoteThreadOf),
    // so QCZLCL…001 keeps the thread QCZ…001 on the bell.
    expect(sql).toBe(
      'exists (select 1 from "quote" where "quote"."company_id" = "quote_comment"."company_id" and "quote"."deleted_at" is null and (regexp_replace("quote"."quote_number", $1, $2) = "quote_comment"."thread_ref" or regexp_replace("quote"."quote_number", $3, $4) like "quote_comment"."thread_ref" || \'-R%\'))',
    );
    expect(params).toEqual([LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT, LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT]);
  });
});
