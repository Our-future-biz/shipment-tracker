import { sql } from "drizzle-orm";
import { pgTable, text, uuid, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantIndex } from "../../../lib/db/defaults";
import { companyTable } from "./company.schema";

export const userTable = pgTable(
  "app_user",
  {
    ...defaultTableColumns,
    // Which company this user belongs to. FK to company.id (same auth DB).
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull().default(""),
    role: text("role").notNull().default("user"),
  },
  (table) => [
    ...defaultTableIndexes("app_user", table),
    tenantIndex("app_user", table),
    // Login is by email alone (no company context on the login form), so an address
    // maps to exactly one live user. One person = one account = one company; a soft
    // deleted user frees their address for reuse.
    uniqueIndex("app_user_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`deleted_at IS NULL`),
    // Roles are a fixed set; reject anything else at the DB level too.
    check("app_user_role_check", sql`${table.role} IN ('superadmin', 'admin', 'manager', 'user')`),
  ],
);
