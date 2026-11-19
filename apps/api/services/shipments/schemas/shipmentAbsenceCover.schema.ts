import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantColumns } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

/** How a dated cover ended: cleared by the cover job, left as somebody changed it since, or its job gone. */
export type AbsenceCoverOutcome = "cleared" | "changed" | "gone";

// The dated Holiday Cover (Council Outlay 11, D12; lib/absenceCover): while a user is away (auth's
// user_absence) with a cover named, the cover job sets that cover as the Holiday Cover of each of
// their active jobs that has none, and clears it again once the absence ended, was shortened or
// deleted - only where the job still holds the e-mail it set. One row per absence and job it set
// (or is about to set) a cover on; `set_at` stays empty until the job's write went through, so a
// cover somebody cleared by hand meanwhile is not set again. A row is never written over once
// cleared: an absence that sets the job again is a new row.
export const shipmentAbsenceCoverTable = pgTable(
  "shipment_absence_cover",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    // auth's user_absence.id (another database: no foreign key).
    absenceId: uuid("absence_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    // Who was away, as auth named them when the cover was set.
    absentUserId: uuid("absent_user_id").notNull(),
    absentEmail: text("absent_email").notNull(),
    absentName: text("absent_name").notNull().default(""),
    // The absence's days as they were when the cover was set (the history line names them).
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    // The e-mail set as Holiday Cover, as stored on the job.
    coverEmail: text("cover_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the job's Holiday Cover was set; null while the write is still to go through.
    setAt: timestamp("set_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    outcome: text("outcome").$type<AbsenceCoverOutcome>(),
  },
  (table) => [
    // The cover job reads the open rows of a company.
    index("shipment_absence_cover_open_idx").on(table.companyId).where(sql`cleared_at IS NULL`),
    index("shipment_absence_cover_shipment_id_idx").on(table.shipmentId),
    // One open row per absence and job: a run twice at the same moment records it once.
    uniqueIndex("shipment_absence_cover_open_unique").on(table.absenceId, table.shipmentId).where(sql`cleared_at IS NULL`),
    foreignKey({ name: "shipment_absence_cover_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    check("shipment_absence_cover_outcome_check", sql`${table.outcome} IS NULL OR ${table.outcome} IN ('cleared', 'changed', 'gone')`),
    check("shipment_absence_cover_cleared_check", sql`(${table.clearedAt} IS NULL) = (${table.outcome} IS NULL)`),
  ],
);

export type ShipmentAbsenceCoverRecord = typeof shipmentAbsenceCoverTable.$inferSelect;
export type NewShipmentAbsenceCoverRecord = typeof shipmentAbsenceCoverTable.$inferInsert;
