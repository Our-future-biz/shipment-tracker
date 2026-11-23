import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
    createdById: uuid("created_by_id"),
    createdByName: text("created_by_name").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("co_loading_sailing", table),
    tenantIndex("co_loading_sailing", table),
    index("co_loading_sailing_service_idx").on(table.companyId, table.serviceId, table.createdAt),
  ],
);

export type CoLoadingSailingRecord = typeof coLoadingSailingTable.$inferSelect;
export type NewCoLoadingSailingRecord = typeof coLoadingSailingTable.$inferInsert;
