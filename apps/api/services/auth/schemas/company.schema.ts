import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

// The tenant root. Every tenant-scoped row across all services references company.id
// (as a bare uuid — company lives in the auth database). Slug is a stable, URL-safe
// identifier used to route each company's frontend to its data.
export const companyTable = pgTable(
  "company",
  {
    ...defaultTableColumns,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("company", table),
    // Slug is unique among live companies; a soft-deleted company frees its slug.
    uniqueIndex("company_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
  ],
);
