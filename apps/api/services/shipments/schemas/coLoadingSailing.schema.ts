import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// A Co-Loading Concept service's sailing (lib/coLoadingSailing): the vessel the service's cargo goes on,
// made with "Create new sailing" on the service's page. Not while the service is closed.
export const coLoadingSailingTable = pgTable(
  "co_loading_sailing",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    serviceId: uuid("service_id").notNull(),
    // The vessel's name, or the week it sails ("WEEK 44") for an import whose vessel is not known yet.
    vessel: text("vessel").notNull(),
    // "" only with a week in vessel.
    voyage: text("voyage").notNull().default(""),
    // Places as the app's place picker stores them ("Shanghai (CNSHA)").
    pol: text("pol").notNull(),
    pod: text("pod").notNull(),
    hub: text("hub").notNull(),
    // A container type as quotes and shipments name it ("40' HC").
    containerType: text("container_type").notNull(),
    // How many containers of that type the sailing has: their capacity is added up (Council Outlay 12, D15).
    containerCount: integer("container_count").notNull().default(1),
    // The day cargo must be in by; null while none is set. A warning when linking after it, never a refusal (D16).
    cutoffDate: date("cutoff_date", { mode: "string" }),
    // The day the sailing leaves; null while not known. Its ČNB rates value the box costs on Earnings (Council Outlay 13, D10).
    departureDate: date("departure_date", { mode: "string" }),
    // Where the sailing stands, set by hand (Council Outlay 14, C3): open, closed (for cargo), departed,
    // arrived, devanned. From "closed" on, linking a shipment asks for a reason.
    stage: text("stage").notNull().default("open"),
    // The box is over its limit and the people who must act were told (Council Outlay 14, C4): told
    // once, and again only after the box was back within its limits.
    overNotified: boolean("over_notified").notNull().default(false),
    // A free note for hand-overs (Council Outlay 14, C5), with who wrote it last and when.
    note: text("note").notNull().default(""),
    noteByName: text("note_by_name").notNull().default(""),
    noteAt: timestamp("note_at", { withTimezone: true }),
    createdById: uuid("created_by_id"),
    createdByName: text("created_by_name").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("co_loading_sailing", table),
    tenantIndex("co_loading_sailing", table),
    index("co_loading_sailing_service_idx").on(table.companyId, table.serviceId, table.createdAt),
    check("co_loading_sailing_stage_check", sql`${table.stage} IN ('open', 'closed', 'departed', 'arrived', 'devanned')`),
  ],
);

export type CoLoadingSailingRecord = typeof coLoadingSailingTable.$inferSelect;
export type NewCoLoadingSailingRecord = typeof coLoadingSailingTable.$inferInsert;
