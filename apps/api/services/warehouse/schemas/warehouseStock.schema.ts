import { pgTable, text, integer, doublePrecision } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Stock tab of the warehouse module: what is on hand, where it is, how it moved and what
// sits under customs control.

// One stock line per house job on hand.
export const warehouseStockLineTable = pgTable(
  "warehouse_stock_line",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    job: text("job").notNull(), // house job / warehouse reference
    customer: text("customer").notNull().default(""),
    shipper: text("shipper").notNull().default(""),
    pod: text("pod").notNull().default(""),
    pieces: integer("pieces").notNull().default(0),
    packageType: text("package_type").notNull().default(""),
    weightKg: doublePrecision("weight_kg").notNull().default(0),
    cbm: doublePrecision("cbm").notNull().default(0),
    location: text("location").notNull().default(""), // bay, e.g. A-04-2 (zone-bay-level)
    receivedAt: text("received_at").notNull(), // YYYY-MM-DD
    freeDays: integer("free_days").notNull().default(7),
    customs: text("customs").notNull().default("Free circulation"), // Free circulation | T1 bonded | Export cleared
    status: text("status").notNull().default("Available"), // Available | Allocated | On hold | Picked
    consol: text("consol").notNull().default(""), // master job it is allocated to
    marks: text("marks").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("warehouse_stock_line", table), tenantIndex("warehouse_stock_line", table)],
);

// Storage zones of the floor; occupancy is counted from the stock lines located in them.
export const warehouseZoneTable = pgTable(
  "warehouse_zone",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    code: text("code").notNull(), // A, B, C …
    name: text("name").notNull().default(""),
    bays: integer("bays").notNull().default(0),
    capacity: integer("capacity").notNull().default(0), // pallet positions; 0 = floor storage by m²
    blockedBays: text("blocked_bays").notNull().default(""), // comma list, e.g. "C-05"
    note: text("note").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("warehouse_zone", table), tenantIndex("warehouse_zone", table)],
);

// Movement / audit trail. Rows are only ever added: a movement is never edited or deleted.
export const warehouseStockMovementTable = pgTable(
  "warehouse_stock_movement",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    at: text("at").notNull(), // YYYY-MM-DDTHH:MM
    type: text("type").notNull(), // Receipt | Put-away | Transfer | Pick | Load | Adjustment | Rework
    job: text("job").notNull().default(""),
    pieces: integer("pieces").notNull().default(0),
    fromLocation: text("from_location").notNull().default(""),
    toLocation: text("to_location").notNull().default(""),
    userName: text("user_name").notNull().default(""), // who recorded it (from the login)
    reference: text("reference").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("warehouse_stock_movement", table), tenantIndex("warehouse_stock_movement", table)],
);

// Customs warehouse register: entry and discharge per MRN with the running balance.
export const warehouseBondedEntryTable = pgTable(
  "warehouse_bonded_entry",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    mrn: text("mrn").notNull(),
    job: text("job").notNull().default(""),
    consignee: text("consignee").notNull().default(""),
    procedure: text("procedure").notNull().default("71 00 — customs warehousing"),
    entryDate: text("entry_date").notNull().default(""), // YYYY-MM-DD
    pieces: integer("pieces").notNull().default(0),
    weightKg: doublePrecision("weight_kg").notNull().default(0),
    customsValue: text("customs_value").notNull().default(""), // with currency, e.g. "CZK 412 000"
    discharge: text("discharge").notNull().default(""), // date · document, empty while in stock
    balance: integer("balance").notNull().default(0), // pieces still under customs control
  },
  (table) => [...defaultTableIndexes("warehouse_bonded_entry", table), tenantIndex("warehouse_bonded_entry", table)],
);
