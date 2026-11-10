import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT } from "../salesReference";

/**
 * A quote's reference in SQL without the letters of its Freight Mode, as plainSalesReference has it
 * (lib/salesReference): QCZLCL20261109001-2 → QCZ20261109001-2, other text as it is. What a reference
 * is looked up, counted and grouped by wherever it is kept, so QCZ20261109001 and QCZLCL20261109001
 * name one quote - also a copy that still holds the reference from before a change of Freight Mode.
 */
export const plainSalesReferenceSql = (reference: PgColumn | SQL): SQL<string> =>
  sql<string>`regexp_replace(${reference}, ${LETTERED_SALES_REFERENCE}, ${PLAIN_SALES_REFERENCE_REPLACEMENT})`;
