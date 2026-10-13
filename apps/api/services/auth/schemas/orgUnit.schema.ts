import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantIndex } from "../../../lib/db/defaults";
import { companyTable } from "./company.schema";
import { locationTable } from "./location.schema";

// The company's own org structure. A user is assigned to at most one department and one
// branch; their country is the country of their branch. The noticeboard is addressed by these.
export const departmentTable = pgTable(
  "department",
  {
    ...defaultTableColumns,
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    name: text("name").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("department", table),
    tenantIndex("department", table),
    uniqueIndex("department_company_name_unique")
      .on(table.companyId, sql`lower(${table.name})`)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const branchTable = pgTable(
  "branch",
  {
    ...defaultTableColumns,
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    name: text("name").notNull(),
    // The country's name, which the country noticeboard matches on.
    country: text("country").notNull(),
    countryCode: text("country_code"),
    locationId: integer("location_id").references(() => locationTable.id),
    // The city's name as picked, kept alongside its UN/LOCODE place.
    city: text("city"),
  },
  (table) => [
    ...defaultTableIndexes("branch", table),
    tenantIndex("branch", table),
    uniqueIndex("branch_company_name_unique")
      .on(table.companyId, sql`lower(${table.name})`)
      .where(sql`deleted_at IS NULL`),
  ],
);

// The countries the company works in, each picked once from the fixed country list.
export const countryTable = pgTable(
  "country",
  {
    ...defaultTableColumns,
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    // ISO 3166-1 alpha-2, e.g. "CZ".
    code: text("code").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("country", table),
    tenantIndex("country", table),
    uniqueIndex("country_company_code_unique").on(table.companyId, table.code).where(sql`deleted_at IS NULL`),
  ],
);
