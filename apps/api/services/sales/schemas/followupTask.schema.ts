import { sql } from "drizzle-orm";
import { pgTable, text, uuid, date, timestamp, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import type { TaskType } from "../utils/followupTask.utils";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// A manual follow-up task of Sales: one row per task, so two people adding, ticking or removing
// tasks at the same moment each write their own row. Until this table existed the tasks of a
// company were one JSON list in sales_preference that every change replaced whole.
export const followupTaskTable = pgTable(
  "followup_task",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    type: text("type").$type<TaskType>().notNull().default("Call"),
    note: text("note").notNull().default(""),
    // A calendar day. "Overdue" is never stored: it follows from this day and from done_at.
    dueDate: date("due_date", { mode: "string" }),
    // Users live in the auth service, customers and quotes in their own databases: plain keys,
    // no FK. A customer or quote that is deleted later leaves its key behind as text.
    assigneeUserId: uuid("assignee_user_id"),
    customerId: uuid("customer_id"),
    // The company as typed, or the customer's name at the time the task was linked to it.
    customerLabel: text("customer_label").notNull().default(""),
    contact: text("contact").notNull().default(""),
    quoteNumber: text("quote_number"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: uuid("done_by"),
    createdBy: uuid("created_by"),
    // The position a task had in the old JSON list; NULL for a task created as a row.
    legacyIndex: integer("legacy_index"),
  },
  (table) => [
    ...defaultTableIndexes("followup_task", table),
    tenantIndex("followup_task", table),
    index("followup_task_assignee_user_id_idx").on(table.assigneeUserId),
    index("followup_task_due_date_idx").on(table.dueDate),
    check("followup_task_type_check", sql`${table.type} IN ('Call', 'Email', 'Visit')`),
    // One row per position of the old list, deleted rows included: what makes the import of that
    // list (sales_import_followup_tasks, migration 0003) unable to copy a task twice.
    uniqueIndex("followup_task_company_legacy_unique")
      .on(table.companyId, table.legacyIndex)
      .where(sql`legacy_index IS NOT NULL`),
  ],
);

export type FollowupTaskRecord = typeof followupTaskTable.$inferSelect;
export type NewFollowupTaskRecord = typeof followupTaskTable.$inferInsert;
