import { sql } from "drizzle-orm";
import { pgTable, text, integer, numeric, date, boolean, jsonb, uuid, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { CostSplitBasis, LaneServiceKind } from "../interfaces/interfaces";

// The trucking profile of a haulier: a Customer Database company with the role "haulier"
// (customer_id is a bare uuid into the customers database; no cross-database FK). One live
// profile per company and haulier. `version` is bumped by every save, block and unblock, so a
// stale save is refused. Whether the haulier may be put on a trip is computed on read
// (lib/haulierRules.ts), never stored.
export const truckingHaulierProfileTable = pgTable(
  "trucking_haulier_profile",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id").notNull(),
    insurer: text("insurer").notNull().default(""),
    insurancePolicyNo: text("insurance_policy_no").notNull().default(""),
    insuranceLimit: numeric("insurance_limit", { precision: 14, scale: 2, mode: "number" }),
    insuranceCurrency: text("insurance_currency").notNull().default("EUR"),
    insuranceValidTo: date("insurance_valid_to", { mode: "string" }),
    licenceNo: text("licence_no").notNull().default(""),
    licenceValidTo: date("licence_valid_to", { mode: "string" }),
    licenceUnlimited: boolean("licence_unlimited").notNull().default(true),
    adrCapable: boolean("adr_capable").notNull().default(false),
    vehicleTypes: jsonb("vehicle_types").$type<string[]>().notNull().default([]),
    paymentDays: integer("payment_days").notNull().default(30),
    currency: text("currency").notNull().default("CZK"),
    vatUnreliable: boolean("vat_unreliable").notNull().default(false),
    bankAccountPublished: boolean("bank_account_published").notNull().default(false),
    vatCheckedAt: date("vat_checked_at", { mode: "string" }),
    costSplitBasis: text("cost_split_basis").$type<CostSplitBasis>().notNull().default("chargeable_weight"),
    blocked: boolean("blocked").notNull().default(false),
    blockReason: text("block_reason").notNull().default(""),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    /** Display name of who blocked */
    blockedBy: text("blocked_by"),
    notes: text("notes").notNull().default(""),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("trucking_haulier_profile", table),
    tenantIndex("trucking_haulier_profile", table),
    uniqueIndex("trucking_haulier_profile_customer_unique").on(table.companyId, table.customerId).where(sql`deleted_at IS NULL`),
    check("trucking_haulier_profile_currency_check", sql`${table.currency} IN ('CZK', 'EUR') AND ${table.insuranceCurrency} IN ('CZK', 'EUR')`),
    check("trucking_haulier_profile_split_check", sql`${table.costSplitBasis} IN ('chargeable_weight', 'ldm', 'pallet_places')`),
    check("trucking_haulier_profile_payment_days_check", sql`${table.paymentDays} >= 0`),
  ],
);

// A lane the haulier likes to run: CZ postcode ranges (5 digits, from <= to) of origin and
// destination. Belongs to one profile; replaced together with it on a save.
export const truckingPreferredLaneTable = pgTable(
  "trucking_preferred_lane",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    profileId: uuid("profile_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    originPostcodeFrom: text("origin_postcode_from").notNull(),
    originPostcodeTo: text("origin_postcode_to").notNull(),
    destPostcodeFrom: text("dest_postcode_from").notNull(),
    destPostcodeTo: text("dest_postcode_to").notNull(),
    serviceKind: text("service_kind").$type<LaneServiceKind>().notNull().default("ANY"),
    note: text("note").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("trucking_preferred_lane", table),
    tenantIndex("trucking_preferred_lane", table),
    index("trucking_preferred_lane_profile_idx").on(table.profileId),
    foreignKey({ name: "trucking_preferred_lane_profile_fk", columns: [table.profileId], foreignColumns: [truckingHaulierProfileTable.id] }).onDelete("restrict"),
    check("trucking_preferred_lane_kind_check", sql`${table.serviceKind} IN ('ANY', 'LTL', 'FTL', 'LINEHAUL')`),
    check(
      "trucking_preferred_lane_postcode_check",
      sql`${table.originPostcodeFrom} ~ '^[0-9]{5}$' AND ${table.originPostcodeTo} ~ '^[0-9]{5}$' AND ${table.destPostcodeFrom} ~ '^[0-9]{5}$' AND ${table.destPostcodeTo} ~ '^[0-9]{5}$' AND ${table.originPostcodeFrom} <= ${table.originPostcodeTo} AND ${table.destPostcodeFrom} <= ${table.destPostcodeTo}`,
    ),
  ],
);

export type TruckingHaulierProfileRecord = typeof truckingHaulierProfileTable.$inferSelect;
export type NewTruckingHaulierProfileRecord = typeof truckingHaulierProfileTable.$inferInsert;
export type TruckingPreferredLaneRecord = typeof truckingPreferredLaneTable.$inferSelect;
