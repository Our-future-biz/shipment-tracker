import { sql } from "drizzle-orm";
import { pgTable, text, integer, numeric, date, jsonb, uuid, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type {
  ServiceLevelCode,
  TariffMode,
  TariffScope,
  TariffSide,
  TariffVersionInput,
  ValidationFinding,
  ZoneBy,
} from "../interfaces/interfaces";

// A trucking price list: whose prices (side + owner), for what kind of transport (scope), and how
// they are priced (a full MATRIX, or a customer's DISCOUNT off the Standard sell list). One live
// tariff per company, side, scope and owner; the owner (a Customer Database company, bare uuid,
// no cross-database FK) is null for the Standard sell list and the internal tariff. The prices
// themselves live in versions.
export const truckingTariffTable = pgTable(
  "trucking_tariff",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    side: text("side").$type<TariffSide>().notNull(),
    scope: text("scope").$type<TariffScope>().notNull(),
    mode: text("mode").$type<TariffMode>().notNull().default("MATRIX"),
    name: text("name").notNull(),
    ownerCustomerId: uuid("owner_customer_id"),
    currency: text("currency").$type<"CZK" | "EUR">().notNull().default("CZK"),
    zoneBy: text("zone_by").$type<ZoneBy>().notNull().default("DESTINATION"),
    /** DISCOUNT only: % off the Standard list (negative = uplift) */
    discountPercent: numeric("discount_percent", { precision: 7, scale: 3, mode: "number" }),
  },
  (table) => [
    ...defaultTableIndexes("trucking_tariff", table),
    tenantIndex("trucking_tariff", table),
    uniqueIndex("trucking_tariff_owner_unique")
      .on(table.companyId, table.side, table.scope, table.ownerCustomerId)
      .where(sql`deleted_at IS NULL AND owner_customer_id IS NOT NULL`),
    // The Standard sell list and the internal tariff have no owner: one of each per scope.
    uniqueIndex("trucking_tariff_no_owner_unique")
      .on(table.companyId, table.side, table.scope)
      .where(sql`deleted_at IS NULL AND owner_customer_id IS NULL`),
    check("trucking_tariff_side_check", sql`${table.side} IN ('BUY', 'SELL', 'INTERNAL')`),
    check("trucking_tariff_scope_check", sql`${table.scope} IN ('LTL', 'FTL', 'LINEHAUL')`),
    check("trucking_tariff_currency_check", sql`${table.currency} IN ('CZK', 'EUR')`),
    check("trucking_tariff_zone_by_check", sql`${table.zoneBy} IN ('DESTINATION', 'ORIGIN')`),
    check(
      "trucking_tariff_owner_check",
      sql`(${table.side} = 'BUY' AND ${table.ownerCustomerId} IS NOT NULL) OR ${table.side} = 'SELL' OR (${table.side} = 'INTERNAL' AND ${table.ownerCustomerId} IS NULL)`,
    ),
    check(
      "trucking_tariff_mode_check",
      sql`(${table.mode} = 'MATRIX' AND ${table.discountPercent} IS NULL) OR (${table.mode} = 'DISCOUNT' AND ${table.side} = 'SELL' AND ${table.ownerCustomerId} IS NOT NULL AND ${table.discountPercent} IS NOT NULL AND ${table.discountPercent} > -100 AND ${table.discountPercent} < 100)`,
    ),
  ],
);

// One version of a MATRIX tariff's prices. The whole input (zones, bands, rates, minimum charges,
// surcharges) is one jsonb document: it is always written and read as a whole, and rating needs
// all of it for a tariff at once, so one row read beats joining thousands of rate rows. The
// columns beside it (levels, zone and warning counts) let lists show a version without loading it.
//
// A draft has activated_at null; valid_from / valid_to then hold the planned validity. Once
// activated the validity is binding: an EXCLUDE constraint (hand-added in the migration) keeps
// the activated, not superseded, live versions of one tariff from overlapping by a single day.
// superseded_at marks a scheduled version replaced before it started. Status is derived on read.
// A version imported from an Excel file keeps the file in the bucket (source_key, its sha256 and
// name here) and the problems met reading it (parse_findings), which activation still counts.
export const truckingTariffVersionTable = pgTable(
  "trucking_tariff_version",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    tariffId: uuid("tariff_id").notNull(),
    versionNo: integer("version_no").notNull(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }),
    input: jsonb("input").$type<TariffVersionInput>().notNull(),
    findings: jsonb("findings").$type<ValidationFinding[]>().notNull().default([]),
    serviceLevels: jsonb("service_levels").$type<ServiceLevelCode[]>().notNull().default([]),
    zoneCount: integer("zone_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdByUserId: uuid("created_by_user_id"),
    /** Display name */
    createdBy: text("created_by"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    /** Display name */
    activatedBy: text("activated_by"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    /** Problems met reading the uploaded file; they stay with the draft and keep it from activation */
    parseFindings: jsonb("parse_findings").$type<ValidationFinding[]>().notNull().default([]),
    /** The uploaded file (bucket trucking-tariff-files); null when the version was entered without one */
    sourceFileName: text("source_file_name"),
    sourceSha256: text("source_sha256"),
    sourceKey: text("source_key"),
  },
  (table) => [
    ...defaultTableIndexes("trucking_tariff_version", table),
    tenantIndex("trucking_tariff_version", table),
    index("trucking_tariff_version_tariff_idx").on(table.tariffId),
    uniqueIndex("trucking_tariff_version_no_unique").on(table.tariffId, table.versionNo),
    foreignKey({ name: "trucking_tariff_version_tariff_fk", columns: [table.tariffId], foreignColumns: [truckingTariffTable.id] }).onDelete("restrict"),
    check("trucking_tariff_version_validity_check", sql`${table.validTo} IS NULL OR ${table.validTo} >= ${table.validFrom}`),
    check("trucking_tariff_version_superseded_check", sql`${table.supersededAt} IS NULL OR ${table.activatedAt} IS NOT NULL`),
  ],
);

export type TruckingTariffRecord = typeof truckingTariffTable.$inferSelect;
export type NewTruckingTariffRecord = typeof truckingTariffTable.$inferInsert;
export type TruckingTariffVersionRecord = typeof truckingTariffVersionTable.$inferSelect;
