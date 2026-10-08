import { sql } from "drizzle-orm";
import { pgTable, text, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantIndex } from "../../../lib/db/defaults";
import { companyTable } from "./company.schema";

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
    country: text("country").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("branch", table),
    tenantIndex("branch", table),
    uniqueIndex("branch_company_name_unique")
      .on(table.companyId, sql`lower(${table.name})`)
      .where(sql`deleted_at IS NULL`),
  ],
);
