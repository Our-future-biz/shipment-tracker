import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";
import type { AppModule } from "../interfaces/interfaces";

// The tenant root. Every tenant-scoped row across all services references company.id
// (as a bare uuid — company lives in the auth database). Slug is a stable, URL-safe
// identifier used to route each company's frontend to its data.
export const companyTable = pgTable(
  "company",
  {
    ...defaultTableColumns,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Modules this company's users do not get (lib/modules requireModule); superadmins still see them. */
    hiddenModules: text("hidden_modules").array().$type<AppModule[]>().notNull().default(sql`'{}'::text[]`),
  },
  (table) => [
    ...defaultTableIndexes("company", table),
    // Slug is unique among live companies; a soft-deleted company frees its slug.
    uniqueIndex("company_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    check("company_hidden_modules_check", sql`${table.hiddenModules} <@ ARRAY['warehouse_concept', 'trucking_concept']::text[]`),
  ],
);
