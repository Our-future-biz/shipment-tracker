import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { plainSalesReferenceSql } from "../../../lib/db/salesReferenceSql";

// The forms of a quote's number the quotes database looks quotes up by, each written once: for the
// expression index that serves it (quote.schema) and for the queries that use it. Postgres uses an
// expression index only for the very same expression. The queries hand its patterns over as
// parameters, and Postgres plans each statement node-postgres sends (an unnamed one) with their
// values in place - so the query's expression is the index's, whose patterns are written in.

/**
 * `expression` starts with `prefix`, as a range the plain-number index answers whatever the prefix's
 * value: a LIKE 'prefix%' uses an index only when the planner sees the pattern as a constant, which a
 * parameter is not. Compared byte by byte (~>=~ / ~<~, the text_pattern_ops of the index), from the
 * prefix to the prefix followed by the highest character, which no reference holds.
 */
export const startsWithSql = (expression: SQL, prefix: string): SQL =>
  sql`(${expression} ~>=~ ${prefix} AND ${expression} ~<~ ${`${prefix}\u{10FFFF}`})`;

/** A revision's suffix, as revisionRoot (lib/salesReference) takes it away: QCZ…001-R2 → QCZ…001. */
export const REVISION_SUFFIX = "-R[0-9]+$";

/** The number without the letters of its Freight Mode, as plainSalesReference has it: QCZLCL…001-2 → QCZ…001-2. */
export const plainQuoteNumberSql = (quoteNumber: PgColumn): SQL<string> => plainSalesReferenceSql(quoteNumber);

/**
 * The chat thread of the number, as quoteThreadOf has it: plain, and without a revision's suffix
 * (QCZLCL…001-R2 → QCZ…001), so a quote, its revisions and its renames are one thread. Not trimmed
 * as quoteThreadOf trims what it is given: a stored number has nothing around it.
 */
export const quoteThreadSql = (quoteNumber: PgColumn): SQL<string> =>
  sql<string>`regexp_replace(${plainQuoteNumberSql(quoteNumber)}, ${REVISION_SUFFIX}, '')`;
