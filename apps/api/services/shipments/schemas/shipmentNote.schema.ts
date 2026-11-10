import { pgTable, text, uuid, timestamp, index, boolean, date } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// The shipment's notepad: short notes anyone at the shipment writes down (what is still to do),
// each ticked off when done. Shared by everyone who opens the shipment.
export const shipmentNoteTable = pgTable(
  "shipment_note",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    // The to-do's title: one short line.
    text: text("text").notNull(),
    // More about it, when a title is not enough.
    details: text("details").notNull().default(""),
    // The day it has to be done by; null for no deadline.
    dueDate: date("due_date", { mode: "string" }),
    // Who wrote it (auth user id; shown by e-mail).
    authorId: uuid("author_id"),
    // Set when ticked off, cleared when ticked back.
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneById: uuid("done_by_id"),
    // Starred: kept at the top of the list.
    pinned: boolean("pinned").notNull().default(false),
    // When it was starred: the latest starred one is the top one.
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("shipment_note", table),
    tenantIndex("shipment_note", table),
    index("shipment_note_shipment_id_idx").on(table.shipmentId),
  ],
);

export type ShipmentNoteRecord = typeof shipmentNoteTable.$inferSelect;
export type NewShipmentNoteRecord = typeof shipmentNoteTable.$inferInsert;
