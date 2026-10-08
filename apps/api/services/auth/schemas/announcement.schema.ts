import { sql } from "drizzle-orm";
import { pgTable, text, uuid, bigint, timestamp, index, check, primaryKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantIndex } from "../../../lib/db/defaults";
import { companyTable } from "./company.schema";
import { userTable } from "./user.schema";
import { departmentTable, branchTable } from "./orgUnit.schema";

// A noticeboard post. `scope` picks the board it hangs on; exactly the matching target
// column is filled (none for "company"), which the service enforces.
export const announcementTable = pgTable(
  "announcement",
  {
    ...defaultTableColumns,
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    scope: text("scope").notNull(),
    departmentId: uuid("department_id").references(() => departmentTable.id),
    branchId: uuid("branch_id").references(() => branchTable.id),
    country: text("country"),
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    authorId: uuid("author_id").notNull().references(() => userTable.id),
  },
  (table) => [
    ...defaultTableIndexes("announcement", table),
    tenantIndex("announcement", table),
    index("announcement_company_scope_idx").on(table.companyId, table.scope),
    check("announcement_scope_check", sql`${table.scope} IN ('company', 'department', 'branch', 'country')`),
    check("announcement_severity_check", sql`${table.severity} IN ('info', 'warning', 'critical')`),
  ],
);

// One row per (post, reader) once the reader has opened the post; no row means unread.
export const announcementReadTable = pgTable(
  "announcement_read",
  {
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcementTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.userId] }),
    index("announcement_read_user_id_idx").on(table.userId),
  ],
);

// Documents attached to a post.
export const announcementAttachmentTable = pgTable(
  "announcement_attachment",
  {
    ...defaultTableColumns,
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcementTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull().default(""),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    // File bytes stored as a base64 data URL in Postgres, as customer documents are.
    fileData: text("file_data").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("announcement_attachment", table),
    tenantIndex("announcement_attachment", table),
    index("announcement_attachment_announcement_id_idx").on(table.announcementId),
  ],
);
