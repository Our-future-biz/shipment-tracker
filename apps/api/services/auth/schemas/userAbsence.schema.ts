import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantIndex } from "../../../lib/db/defaults";
import { companyTable } from "./company.schema";
import { userTable } from "./user.schema";

// A user's absence - a holiday, sick leave, a trip (Council Outlay 11, D12): from one Prague day to
// another, both included, and optionally who covers their jobs meanwhile. Colleagues see who is
// away; Shipments sets the cover as the Holiday Cover of the absent user's active jobs while it
// lasts and clears it afterwards (shipments' absence cover cron), and Shipments → Managers says
// who is away. A user records their own absences; a manager, an admin or a superadmin anybody's of
// the company. Two live absences of one user never overlap (checked under a lock per user, see
// userAbsence.repository). Deleting one is soft: Shipments still clears the covers it set for it.
export const userAbsenceTable = pgTable(
  "user_absence",
  {
    ...defaultTableColumns,
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    // Who is away: a live user of the company.
    userId: uuid("user_id").notNull().references(() => userTable.id),
    // Prague days, YYYY-MM-DD, both included: away from the first day's morning to the last day's evening.
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    // Who covers meanwhile: another live user of the company; null for nobody named.
    coverUserId: uuid("cover_user_id").references(() => userTable.id),
    note: text("note").notNull().default(""),
    // Who recorded it and who last changed it (a superadmin working as the company included, whose
    // own record is in another company: no foreign key).
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
  },
  (table) => [
    tenantIndex("user_absence", table),
    index("user_absence_user_id_idx").on(table.companyId, table.userId, table.fromDate),
    // The cover job's read: the live absences of every company that cover a day or ended lately.
    index("user_absence_to_date_idx").on(table.toDate).where(sql`deleted_at IS NULL`),
    check("user_absence_dates_check", sql`${table.toDate} >= ${table.fromDate}`),
  ],
);

export type UserAbsenceRecord = typeof userAbsenceTable.$inferSelect;
export type NewUserAbsenceRecord = typeof userAbsenceTable.$inferInsert;
