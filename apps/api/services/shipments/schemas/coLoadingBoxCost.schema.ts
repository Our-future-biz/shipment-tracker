import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// The costs of a Co-Loading Concept sailing's boxes (Council Outlay 13, his answers to D4-D6):
// each container has its own Origin Costs, Ocean Freight and Destination Costs - an estimate a
// manager sets, in its own currency, with a note. One row per container and kind; a kind nobody
// has set has no row, or a row with no amount once it was cleared. They stay on the sailing: nothing
// of them is written into a shipment's Costs Breakdown.
export const coLoadingBoxCostTable = pgTable(
  "co_loading_box_cost",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    sailingId: uuid("sailing_id").notNull(),
    // Which of the sailing's containers: 1 up to its number of containers.
    containerNo: integer("container_no").notNull(),
    // "origin" | "ocean" | "destination" (lib/coLoadingBoxCosts).
    kind: text("kind").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("EUR"),
    note: text("note").notNull().default(""),
    updatedById: uuid("updated_by_id"),
    updatedByName: text("updated_by_name").notNull().default(""),
  },
  (table) => [
    tenantIndex("co_loading_box_cost", table),
    uniqueIndex("co_loading_box_cost_one_per_kind").on(table.companyId, table.sailingId, table.containerNo, table.kind),
    check("co_loading_box_cost_kind_check", sql`${table.kind} IN ('origin', 'ocean', 'destination')`),
    check("co_loading_box_cost_container_check", sql`${table.containerNo} >= 1`),
    check("co_loading_box_cost_amount_check", sql`${table.amount} IS NULL OR ${table.amount} >= 0`),
  ],
);

// Every change of a box cost, kept (D16): who, when, the old figure and the new one. Never
// updated, never deleted.
export const coLoadingBoxCostChangeTable = pgTable(
  "co_loading_box_cost_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    sailingId: uuid("sailing_id").notNull(),
    containerNo: integer("container_no").notNull(),
    kind: text("kind").notNull(),
    oldAmount: numeric("old_amount", { precision: 14, scale: 2 }),
    oldCurrency: text("old_currency").notNull().default(""),
    oldNote: text("old_note").notNull().default(""),
    newAmount: numeric("new_amount", { precision: 14, scale: 2 }),
    newCurrency: text("new_currency").notNull().default(""),
    newNote: text("new_note").notNull().default(""),
    changedById: uuid("changed_by_id"),
    changedByName: text("changed_by_name").notNull().default(""),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("co_loading_box_cost_change_sailing_idx").on(table.companyId, table.sailingId, table.changedAt)],
);

export type CoLoadingBoxCostRecord = typeof coLoadingBoxCostTable.$inferSelect;
export type CoLoadingBoxCostChangeRecord = typeof coLoadingBoxCostChangeTable.$inferSelect;
