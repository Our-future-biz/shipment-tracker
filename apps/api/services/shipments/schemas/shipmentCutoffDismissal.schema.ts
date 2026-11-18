import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { CutoffKey } from "../lib/managersCockpit";
import { shipmentTable } from "./shipment.schema";

// A missed cut-off a manager has dismissed with a reason (Council Outlay 11, D7's "until a manager dismisses
// it"): the Closing or a filing (VGM, SI, AMS, ISF) the shared rule calls missed or overdue (lib/managersCockpit
// cutoffsOf). It is dismissed for the date it had then: while the cut-off keeps that date it gives no signal on
// Shipments → Managers nor in the Shipments list's Needs Attention (lib/cutoffDismissals); a new date is a new
// cut-off and counts again. Taken back = deleted_at set, so the row stays as the record of who dismissed what.
export const shipmentCutoffDismissalTable = pgTable(
  "shipment_cutoff_dismissal",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    // Which cut-off, by the shared rule's key.
    cutoff: text("cutoff").$type<CutoffKey>().notNull(),
    // The date the cut-off had when it was dismissed (for AMS / ISF with no deadline typed: 4 days before the ETD).
    cutoffDate: date("cutoff_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    // Who dismissed it, as named then.
    dismissedById: uuid("dismissed_by_id").notNull(),
    dismissedByName: text("dismissed_by_name").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("shipment_cutoff_dismissal", table),
    tenantIndex("shipment_cutoff_dismissal", table),
    index("shipment_cutoff_dismissal_shipment_id_idx").on(table.shipmentId),
    // One live dismissal per cut-off and date: a second click finds the first.
    uniqueIndex("shipment_cutoff_dismissal_live_unique")
      .on(table.companyId, table.shipmentId, table.cutoff, table.cutoffDate)
      .where(sql`deleted_at IS NULL`),
    foreignKey({ name: "shipment_cutoff_dismissal_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    check("shipment_cutoff_dismissal_cutoff_check", sql`${table.cutoff} IN ('closingDate', 'vgmClosing', 'siClosing', 'amsDeadline', 'isfDeadline')`),
  ],
);

export type ShipmentCutoffDismissalRecord = typeof shipmentCutoffDismissalTable.$inferSelect;
export type NewShipmentCutoffDismissalRecord = typeof shipmentCutoffDismissalTable.$inferInsert;
