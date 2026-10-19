import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantIndex } from "../../../lib/db/defaults";
import { companyTable } from "./company.schema";
import { departmentTable, branchTable } from "./orgUnit.schema";

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
    // Where the user sits in the company; both optional. Decides which noticeboards they see.
    departmentId: uuid("department_id").references(() => departmentTable.id),
    branchId: uuid("branch_id").references(() => branchTable.id),
    // A service identity (one per company, "Trucking (system)"): what the system or a haulier
    // causes in other services is sent as this user. It has no password and can never sign in,
    // and it is not shown in user lists or pickers.
    isSystem: boolean("is_system").notNull().default(false),
    // Carried in every token as "tv"; a token with another number is refused. Raised when the
    // password changes or the user is deactivated, which signs them out everywhere.
    tokenVersion: integer("token_version").notNull().default(0),
  },
  (table) => [
    ...defaultTableIndexes("app_user", table),
    tenantIndex("app_user", table),
    index("app_user_department_id_idx").on(table.departmentId),
    index("app_user_branch_id_idx").on(table.branchId),
    // Login is by email alone (no company context on the login form), so an address
    // maps to exactly one live user. One person = one account = one company; a soft
    // deleted user frees their address for reuse.
    uniqueIndex("app_user_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`deleted_at IS NULL`),
    // At most one live service identity per company (created on demand, see ensureSystemUser).
    uniqueIndex("app_user_system_unique")
      .on(table.companyId)
      .where(sql`is_system AND deleted_at IS NULL`),
    // Roles are a fixed set; reject anything else at the DB level too.
    check("app_user_role_check", sql`${table.role} IN ('superadmin', 'admin', 'manager', 'user')`),
  ],
);
