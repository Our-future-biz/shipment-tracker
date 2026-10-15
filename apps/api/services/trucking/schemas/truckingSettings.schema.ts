import { sql } from "drizzle-orm";
import { pgTable, text, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type {
  ChargeableFactors,
  HubAddress,
  MarginFloor,
  ServiceLevelSetting,
  TransportOrderTexts,
  VehicleTypeSetting,
  WaitingFreeTime,
} from "../interfaces/interfaces";

// Trucking settings: one row per company, each part a jsonb document. Everyone may read them;
// only a manager changes them. Every save bumps `version`, so a stale save is refused, and is
// written to trucking_event. No row yet = the defaults (lib/settingsRules.ts).
export const truckingSettingsTable = pgTable(
  "trucking_settings",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    serviceLevels: jsonb("service_levels").$type<ServiceLevelSetting[]>().notNull(),
    vehicleTypes: jsonb("vehicle_types").$type<VehicleTypeSetting[]>().notNull(),
    factors: jsonb("factors").$type<ChargeableFactors>().notNull(),
    marginFloor: jsonb("margin_floor").$type<MarginFloor>().notNull(),
    transportOrder: jsonb("transport_order").$type<TransportOrderTexts>().notNull(),
    /** Our warehouse (Phase 5); empty until a manager sets it */
    hub: jsonb("hub").$type<HubAddress>().notNull().default({ name: "", street: "", postcode: "", city: "", country: "CZ" }),
    /** Free waiting time before the WAITING_TIME surcharge counts (Phase 6) */
    waitingFreeTime: jsonb("waiting_free_time").$type<WaitingFreeTime>().notNull().default({ ltlMinutes: 30, ftlMinutes: 120 }),
    version: integer("version").notNull().default(1),
    /** Display name of who saved last */
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("trucking_settings", table),
    tenantIndex("trucking_settings", table),
    uniqueIndex("trucking_settings_company_unique").on(table.companyId).where(sql`deleted_at IS NULL`),
  ],
);

export type TruckingSettingsRecord = typeof truckingSettingsTable.$inferSelect;
