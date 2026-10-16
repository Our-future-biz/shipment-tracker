import { sql } from "drizzle-orm";
import { pgTable, text, integer, uuid, timestamp, index, uniqueIndex, numeric, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { gateMovementTable } from "./gateMovement.schema";
import { warehouseTaskTable } from "./warehouseTask.schema";

// Stock tab of the warehouse module: what is on hand, where it is, how it moved and what
// sits under customs control.

// One stock line per house job on hand. Lines follow the gate ("auto", one per gate record:
// opened at the receipt, closed when the cargo leaves) or are typed by hand ("manual", linked to
// a position by the picker when possible). Rows are never deleted by the sync.
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
    weightKg: numeric("weight_kg", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
    cbm: numeric("cbm", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
    location: text("location").notNull().default(""), // bay, e.g. A-04-2 (zone-bay-level)
    receivedAt: text("received_at").notNull(), // YYYY-MM-DD
    freeDays: integer("free_days").notNull().default(7),
    customs: text("customs").notNull().default("Free circulation"), // Free circulation | T1 bonded | Temporary storage | Customs warehouse | Export cleared
    status: text("status").notNull().default("Available"), // Available | Allocated | On hold | Picked | Voided
    consol: text("consol").notNull().default(""), // master job it is allocated to
    marks: text("marks").notNull().default(""),
    // The gate record (position) the line belongs to; null = not linked (old manual line).
    movementId: uuid("movement_id"),
    taskId: uuid("task_id"),
    source: text("source").notNull().default("manual"), // auto | manual
    // Closed: left the warehouse (Picked) or the receipt was voided / the position archived (Voided).
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedReason: text("closed_reason").notNull().default(""),
    // The receipt stamp itself (received_at keeps the Prague day the storage clock starts).
    receivedInstant: timestamp("received_instant", { withTimezone: true }),
    customsRegime: text("customs_regime").notNull().default(""), // "" | Temporary storage | Transit T1 | Customs warehouse
  },
  (table) => [
    ...defaultTableIndexes("warehouse_stock_line", table),
    tenantIndex("warehouse_stock_line", table),
    index("warehouse_stock_line_movement_idx").on(table.movementId),
    // At most one automatic line per gate record, ever (the sync updates it in place).
    uniqueIndex("warehouse_stock_line_auto_movement_unique")
      .on(table.companyId, table.movementId)
      .where(sql`source = 'auto' AND deleted_at IS NULL`),
    foreignKey({ name: "wh_stock_line_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_stock_line_task_fk", columns: [table.taskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    index("wh_stock_line_task_idx").on(table.taskId),
  ],
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
    movementId: uuid("movement_id"),
    taskId: uuid("task_id"),
    source: text("source").notNull().default("manual"), // auto (written by the gate sync) | manual
  },
  (table) => [
    ...defaultTableIndexes("warehouse_stock_movement", table),
    tenantIndex("warehouse_stock_movement", table),
    index("warehouse_stock_movement_movement_idx").on(table.movementId),
    foreignKey({ name: "wh_stock_movement_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_stock_movement_task_fk", columns: [table.taskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    index("wh_stock_movement_task_idx").on(table.taskId),
  ],
);

// Customs register: entry and discharge per MRN with the running balance. Positions under customs
// control (temporary storage, T1 transit, customs warehouse) get an "auto" entry opened at the
// receipt and discharged when they leave or are cleared; "manual" entries remain for odd cases.
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
    weightKg: numeric("weight_kg", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
    customsValue: text("customs_value").notNull().default(""), // with currency, e.g. "CZK 412 000"
    discharge: text("discharge").notNull().default(""), // date · document, empty while in stock
    balance: integer("balance").notNull().default(0), // pieces still under customs control
    movementId: uuid("movement_id"),
    taskId: uuid("task_id"),
    source: text("source").notNull().default("manual"), // auto | manual
    regime: text("regime").notNull().default(""), // Temporary storage | Transit T1 | Customs warehouse
    enteredAt: timestamp("entered_at", { withTimezone: true }),
    dischargedAt: timestamp("discharged_at", { withTimezone: true }),
    dischargeRef: text("discharge_ref").notNull().default(""),
    deadline: text("deadline").notNull().default(""), // YYYY-MM-DD, temporary storage only (UCC art. 149)
    voidedReason: text("voided_reason").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_bonded_entry", table),
    tenantIndex("warehouse_bonded_entry", table),
    index("warehouse_bonded_entry_movement_idx").on(table.movementId),
    uniqueIndex("warehouse_bonded_entry_auto_movement_unique")
      .on(table.companyId, table.movementId)
      .where(sql`source = 'auto' AND deleted_at IS NULL`),
    foreignKey({ name: "wh_bonded_entry_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_bonded_entry_task_fk", columns: [table.taskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    index("wh_bonded_entry_task_idx").on(table.taskId),
  ],
);
