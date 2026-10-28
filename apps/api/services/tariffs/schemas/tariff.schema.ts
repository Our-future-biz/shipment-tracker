import { sql } from "drizzle-orm";
import { pgTable, text, integer, date, jsonb, uuid, timestamp, index, uniqueIndex, check, foreignKey, doublePrecision } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type {
  CollectionFreightMode,
  CollectionLayout,
  LayoutSource,
  OceanEquipment,
  OceanLayout,
  OceanPlace,
  OceanPortStatus,
  RailDirection,
  RailLayout,
  SheetPreview,
  TariffFinding,
  TariffPortCode,
  SupplierTariffMode,
  SupplierTariffStatus,
} from "../interfaces/interfaces";

/** How a version's file is read: a rail, collection or ocean layout, by its tariff's mode. */
export type TariffLayout = RailLayout | CollectionLayout | OceanLayout;

// A supplier's price list (e.g. Metrans' rail prices from Hamburg / Bremerhaven / Wilhelmshaven to
// Czechia). The supplier is a Customer Database company (another database, so no foreign key).
// A rail tariff ticks the ports it is for and whether it is import, export or both (an operator can
// have several, e.g. one for Hamburg / Bremerhaven and one for Koper); a collections tariff ticks
// the freight it collects and delivers (Sea LCL, Air) and has no ports; a shipping line's (ocean)
// tariff ticks import / export, its ports being in its rates.
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
    /** Rail: UN/LOCODEs; which ones can be chosen is checked by the API, so a port is added without a migration */
    ports: text("ports").array().$type<TariffPortCode[]>().notNull(),
    directions: text("directions").array().$type<RailDirection[]>().notNull(),
    /** Collections: what it collects and delivers */
    freightModes: text("freight_modes").array().$type<CollectionFreightMode[]>().notNull().default(sql`'{}'::text[]`),
    layout: jsonb("layout").$type<TariffLayout>(),
  },
  (table) => [
    ...defaultTableIndexes("tariff", table),
    tenantIndex("tariff", table),
    index("tariff_supplier_idx").on(table.companyId, table.supplierCustomerId),
    check("tariff_mode_check", sql`${table.mode} IN ('rail', 'collection', 'ocean')`),
    check("tariff_ports_check", sql`${table.mode} <> 'rail' OR cardinality(${table.ports}) > 0`),
    check(
      "tariff_directions_check",
      sql`${table.directions} <@ ARRAY['import', 'export']::text[] AND (${table.mode} NOT IN ('rail', 'ocean') OR cardinality(${table.directions}) > 0)`,
    ),
    check(
      "tariff_freight_modes_check",
      sql`${table.freightModes} <@ ARRAY['sea_lcl', 'air']::text[] AND (${table.mode} <> 'collection' OR cardinality(${table.freightModes}) > 0)`,
    ),
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
    layout: jsonb("layout").$type<TariffLayout>().notNull(),
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

// A collections version's price rows: one per weight row of each of its tables, the prices by zone
// in the layout's order. Derived from the file, like rail rows; they go with their version.
export const collectionRateTable = pgTable(
  "collection_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    versionId: uuid("version_id").notNull(),
    matrix: integer("matrix").notNull(),
    rowNo: integer("row_no").notNull(),
    weightToKg: doublePrecision("weight_to_kg").notNull(),
    volumeToCbm: doublePrecision("volume_to_cbm"),
    prices: jsonb("prices").$type<(number | null)[]>().notNull(),
  },
  (table) => [
    tenantIndex("collection_rate", table),
    index("collection_rate_version_idx").on(table.versionId, table.matrix, table.weightToKg),
    foreignKey({ name: "collection_rate_version_fk", columns: [table.versionId], foreignColumns: [tariffVersionTable.id] }).onDelete("cascade"),
  ],
);

// A collections version's own postcode → region list (zones by distance), e.g. TOPTRANS' 11,000
// postcodes in 156 regions. A postcode may be in several regions; the first row counts.
export const collectionRegionTable = pgTable(
  "collection_region",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    versionId: uuid("version_id").notNull(),
    rowNo: integer("row_no").notNull(),
    postcode: text("postcode").notNull(),
    region: text("region").notNull(),
    country: text("country").notNull(),
    place: text("place").notNull().default(""),
  },
  (table) => [
    tenantIndex("collection_region", table),
    index("collection_region_version_postcode_idx").on(table.versionId, table.postcode, table.rowNo),
    foreignKey({ name: "collection_region_version_fk", columns: [table.versionId], foreignColumns: [tariffVersionTable.id] }).onDelete("cascade"),
  ],
);

// A collections version's own distances between its regions, in km.
export const collectionDistanceTable = pgTable(
  "collection_distance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    versionId: uuid("version_id").notNull(),
    fromRegion: text("from_region").notNull(),
    toRegion: text("to_region").notNull(),
    km: integer("km").notNull(),
  },
  (table) => [
    tenantIndex("collection_distance", table),
    index("collection_distance_version_regions_idx").on(table.versionId, table.fromRegion, table.toRegion),
    foreignKey({ name: "collection_distance_version_fk", columns: [table.versionId], foreignColumns: [tariffVersionTable.id] }).onDelete("cascade"),
  ],
);

// A collections version's postcode areas and their zones (zones by postcode), 5-digit ranges.
export const collectionAreaTable = pgTable(
  "collection_area",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    versionId: uuid("version_id").notNull(),
    rowNo: integer("row_no").notNull(),
    postcodeFrom: text("postcode_from").notNull(),
    postcodeTo: text("postcode_to").notNull(),
    zone: text("zone").notNull(),
    country: text("country").notNull(),
  },
  (table) => [
    tenantIndex("collection_area", table),
    index("collection_area_version_postcode_idx").on(table.versionId, table.postcodeFrom),
    foreignKey({ name: "collection_area_version_fk", columns: [table.versionId], foreignColumns: [tariffVersionTable.id] }).onDelete("cascade"),
  ],
);

// Our end of collections and deliveries, per freight mode: the postcode a haulier collects to and
// delivers from (Sea LCL: our CFS; Air: the airport's cargo terminal). Set by a manager.
export const collectionHubTable = pgTable(
  "collection_hub",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    freightMode: text("freight_mode").$type<CollectionFreightMode>().notNull(),
    postcode: text("postcode").notNull(),
    country: text("country").notNull(),
    label: text("label").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Display name */
    updatedBy: text("updated_by"),
  },
  (table) => [
    uniqueIndex("collection_hub_mode_unique").on(table.companyId, table.freightMode),
    check("collection_hub_mode_check", sql`${table.freightMode} IN ('sea_lcl', 'air')`),
  ],
);

// An ocean version's rates: one row per port of loading → port of discharge of a sheet row (a row
// naming "HAM / RTM / ANR" gives three), the ports as the tariff writes them, the prices by
// container. Which UN/LOCODE a port name means is in ocean_port.
export const oceanRateTable = pgTable(
  "ocean_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    versionId: uuid("version_id").notNull(),
    tableNo: integer("table_no").notNull(),
    rowNo: integer("row_no").notNull(),
    polName: text("pol_name").notNull(),
    podName: text("pod_name").notNull(),
    via: text("via").notNull().default(""),
    currency: text("currency").notNull(),
    prices: jsonb("prices").$type<Partial<Record<OceanEquipment, number>>>().notNull(),
    note: text("note").notNull().default(""),
  },
  (table) => [
    tenantIndex("ocean_rate", table),
    index("ocean_rate_version_pod_idx").on(table.versionId, table.podName),
    index("ocean_rate_version_row_idx").on(table.versionId, table.tableNo, table.rowNo),
    foreignKey({ name: "ocean_rate_version_fk", columns: [table.versionId], foreignColumns: [tariffVersionTable.id] }).onDelete("cascade"),
  ],
);

// The port names of an ocean version and the UN/LOCODE each means: matched by code (the tariff's
// own port codes, or the place list by name and country), picked or left out by a user, or still
// pending - which stops the version from being approved.
export const oceanPortTable = pgTable(
  "ocean_port",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    versionId: uuid("version_id").notNull(),
    side: text("side").$type<"pol" | "pod">().notNull(),
    name: text("name").notNull(),
    countryHint: text("country_hint"),
    code: text("code"),
    status: text("status").$type<OceanPortStatus>().notNull(),
    candidates: jsonb("candidates").$type<OceanPlace[]>().notNull().default([]),
  },
  (table) => [
    tenantIndex("ocean_port", table),
    uniqueIndex("ocean_port_version_name_unique").on(table.versionId, table.side, table.name),
    index("ocean_port_version_code_idx").on(table.versionId, table.side, table.code),
    foreignKey({ name: "ocean_port_version_fk", columns: [table.versionId], foreignColumns: [tariffVersionTable.id] }).onDelete("cascade"),
    check("ocean_port_side_check", sql`${table.side} IN ('pol', 'pod')`),
    check("ocean_port_status_check", sql`${table.status} IN ('matched', 'manual', 'skipped', 'pending')`),
  ],
);

export type TariffRecord = typeof tariffTable.$inferSelect;
export type TariffVersionRecord = typeof tariffVersionTable.$inferSelect;
export type NewTariffVersionRecord = typeof tariffVersionTable.$inferInsert;
export type RailRateRecord = typeof railRateTable.$inferSelect;
export type NewRailRateRecord = typeof railRateTable.$inferInsert;
export type CollectionRateRecord = typeof collectionRateTable.$inferSelect;
export type CollectionRegionRecord = typeof collectionRegionTable.$inferSelect;
export type CollectionHubRecord = typeof collectionHubTable.$inferSelect;
export type OceanRateRecord = typeof oceanRateTable.$inferSelect;
export type OceanPortRecord = typeof oceanPortTable.$inferSelect;
