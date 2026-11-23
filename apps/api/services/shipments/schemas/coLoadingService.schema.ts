import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid, integer } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { CoLoadingDirection, CoLoadingMode } from "../lib/coLoadingService";

// A Co-Loading Concept service (lib/coLoadingService): one lane customer service consolidates on, shown as
// a tile in the module. Shipments are added to it from the Shipments module later. A manager may close
// it (closed_at) and reopen it.
export const coLoadingServiceTable = pgTable(
  "co_loading_service",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    name: text("name").notNull(),
    // The shipments' Service Name it stands for (lib/coLoadingService CO_LOADING_SERVICE_NAMES): "ISHA".
    serviceName: text("service_name").notNull().default(""),
    // How often it runs (lib/coLoadingService CO_LOADING_FREQUENCIES): weekly | bi_weekly | ad_hoc.
    frequency: text("frequency").notNull().default(""),
    direction: text("direction").$type<CoLoadingDirection>().notNull(),
    mode: text("mode").$type<CoLoadingMode>().notNull(),
    // Places as the app's place picker stores them ("Shanghai (CNSHA)"); "" when not given.
    origin: text("origin").notNull().default(""),
    destination: text("destination").notNull().default(""),
    note: text("note").notNull().default(""),
    // A lower cargo weight for the inland leg between the port and the hub, in kg, set by a manager;
    // null for none. A box of this service is then full at it, where it is below the box's own limit.
    inlandWeightKg: integer("inland_weight_kg"),
    // Who made it, as named then; none for the service the module starts with.
    createdById: uuid("created_by_id"),
    createdByName: text("created_by_name").notNull().default(""),
    // Closed by a manager: its tile is hidden from users and nothing new is put in it until it is
    // reopened (lib/coLoadingService closedServiceError). Null while open. Who closed it, as named then.
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedById: uuid("closed_by_id"),
    closedByName: text("closed_by_name").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("co_loading_service", table),
    tenantIndex("co_loading_service", table),
    // One live service of a name per company, whatever the case: the search and the tiles go by name.
    uniqueIndex("co_loading_service_name_unique").on(table.companyId, sql`lower(${table.name})`).where(sql`deleted_at IS NULL`),
    check("co_loading_service_direction_check", sql`${table.direction} IN ('import', 'export')`),
    check("co_loading_service_mode_check", sql`${table.mode} IN ('sea_lcl', 'sea_fcl', 'air', 'rail', 'road')`),
  ],
);

export type CoLoadingServiceRecord = typeof coLoadingServiceTable.$inferSelect;
export type NewCoLoadingServiceRecord = typeof coLoadingServiceTable.$inferInsert;
