import { sql } from "drizzle-orm";
import { pgTable, text, integer, date, jsonb, uuid, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { LayoutSource, RailDirection, RailLayout, SheetPreview, TariffFinding, TariffPortCode, SupplierTariffMode, SupplierTariffStatus } from "../interfaces/interfaces";

// A supplier's price list (e.g. Metrans' rail prices from Hamburg / Bremerhaven / Wilhelmshaven to
// Czechia). The supplier is a Customer Database company (another database, so no foreign key).
// The user ticks the ports it is for and whether it is import, export or both; an operator can
// have several tariffs, e.g. one for Hamburg / Bremerhaven and one for Koper.
// `layout` is how the last approved version's file was read: the AI is shown it when the next
// year's file is uploaded, so the supplier's format is learned once.
export const tariffTable = pgTable(
  "tariff",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    supplierCustomerId: uuid("supplier_customer_id").notNull(),
    mode: text("mode").$type<SupplierTariffMode>().notNull(),
    name: text("name").notNull(),
    /** UN/LOCODEs; which ones can be chosen is checked by the API, so a port is added without a migration */
    ports: text("ports").array().$type<TariffPortCode[]>().notNull(),
    directions: text("directions").array().$type<RailDirection[]>().notNull(),
    layout: jsonb("layout").$type<RailLayout>(),
  },
  (table) => [
    ...defaultTableIndexes("tariff", table),
    tenantIndex("tariff", table),
    index("tariff_supplier_idx").on(table.companyId, table.supplierCustomerId),
    check("tariff_mode_check", sql`${table.mode} IN ('rail')`),
    check("tariff_ports_check", sql`cardinality(${table.ports}) > 0`),
    check("tariff_directions_check", sql`cardinality(${table.directions}) > 0 AND ${table.directions} <@ ARRAY['import', 'export']::text[]`),
  ],
);

// One upload of a tariff: a draft until a manager approves it, then active; superseded when a
// later approved version covers its dates. The file stays in the bucket (source_key); the layout
// it was read with, the problems found and the first rows of each sheet (for correcting the layout
// by hand) are kept with it. Its prices are the rail_rate rows. A discarded draft is soft-deleted.
export const tariffVersionTable = pgTable(
  "tariff_version",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    tariffId: uuid("tariff_id").notNull(),
    versionNo: integer("version_no").notNull(),
    status: text("status").$type<SupplierTariffStatus>().notNull().default("draft"),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    currency: text("currency").notNull(),
    layout: jsonb("layout").$type<RailLayout>().notNull(),
    layoutSource: text("layout_source").$type<LayoutSource>().notNull(),
    findings: jsonb("findings").$type<TariffFinding[]>().notNull().default([]),
    preview: jsonb("preview").$type<SheetPreview[]>().notNull().default([]),
    rowCount: integer("row_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    sourceFileName: text("source_file_name"),
    sourceSha256: text("source_sha256"),
    sourceKey: text("source_key"),
    createdByUserId: uuid("created_by_user_id"),
    /** Display name */
    createdBy: text("created_by"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    /** Display name */
    activatedBy: text("activated_by"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("tariff_version", table),
    tenantIndex("tariff_version", table),
    index("tariff_version_tariff_idx").on(table.tariffId),
    uniqueIndex("tariff_version_no_unique").on(table.tariffId, table.versionNo),
    foreignKey({ name: "tariff_version_tariff_fk", columns: [table.tariffId], foreignColumns: [tariffTable.id] }).onDelete("restrict"),
    check("tariff_version_status_check", sql`${table.status} IN ('draft', 'active', 'superseded')`),
    check("tariff_version_layout_source_check", sql`${table.layoutSource} IN ('ai', 'remembered', 'edited')`),
    check("tariff_version_validity_check", sql`${table.validTo} IS NULL OR ${table.validFrom} IS NULL OR ${table.validTo} >= ${table.validFrom}`),
  ],
);

// One inland place of a rail tariff version with its prices: one sheet row. Derived from the file,
// so a draft's rows are replaced as a whole when its layout is corrected; they go with their
// version. Prices are one jsonb map (band code → amount): a row is always read with all of them.
// postcode_from / postcode_to are the 5-digit range the row covers, for finding a place's price.
export const railRateTable = pgTable(
  "rail_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    versionId: uuid("version_id").notNull(),
    rowNo: integer("row_no").notNull(),
    country: text("country").notNull(),
    postcode: text("postcode").notNull().default(""),
    postcodeFrom: text("postcode_from"),
    postcodeTo: text("postcode_to"),
    place: text("place").notNull(),
    region: text("region").notNull().default(""),
    via: text("via").notNull().default(""),
    emptyDepot: text("empty_depot").notNull().default(""),
    note: text("note").notNull().default(""),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    prices: jsonb("prices").$type<Record<string, number>>().notNull(),
  },
  (table) => [
    tenantIndex("rail_rate", table),
    index("rail_rate_version_row_idx").on(table.versionId, table.rowNo),
    index("rail_rate_version_postcode_idx").on(table.versionId, table.postcodeFrom),
    foreignKey({ name: "rail_rate_version_fk", columns: [table.versionId], foreignColumns: [tariffVersionTable.id] }).onDelete("cascade"),
  ],
);

export type TariffRecord = typeof tariffTable.$inferSelect;
export type TariffVersionRecord = typeof tariffVersionTable.$inferSelect;
export type NewTariffVersionRecord = typeof tariffVersionTable.$inferInsert;
export type RailRateRecord = typeof railRateTable.$inferSelect;
export type NewRailRateRecord = typeof railRateTable.$inferInsert;
