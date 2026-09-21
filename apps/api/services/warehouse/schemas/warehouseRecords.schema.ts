import { pgTable, text, integer, doublePrecision, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Warehouse module records behind the Containers, Dock & Yard and Reports tabs.

// A container handled by the warehouse: its register data, the devanning / stuffing
// schedule, its time on our yard (with the carrier's detention expiry) and its VGM.
// Usually belongs to a position (via the position's gate movement); yard boxes may not.
export const warehouseContainerTable = pgTable(
  "warehouse_container",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    movementId: uuid("movement_id"),
    number: text("number").notNull(), // e.g. "MSKU 611 902-7"
    equipment: text("equipment").notNull().default(""), // 20' DV · 40' HC …
    seal: text("seal").notNull().default(""),
    pieces: integer("pieces"),
    packages: text("packages").notNull().default(""),
    weightKg: doublePrecision("weight_kg"),
    cbm: doublePrecision("cbm"),
    direction: text("direction").notNull().default("Unloading"), // Unloading | Loading
    note: text("note").notNull().default(""),
    // Devanning / stuffing schedule
    carrier: text("carrier").notNull().default(""),
    masterJob: text("master_job").notNull().default(""),
    dischargePort: text("discharge_port").notNull().default(""),
    arrivedAt: text("arrived_at").notNull().default(""), // YYYY-MM-DDTHH:MM
    houses: integer("houses"),
    dockSlot: text("dock_slot").notNull().default(""),
    scheduleStatus: text("schedule_status").notNull().default("Scheduled"),
    // Yard / container park
    yardState: text("yard_state").notNull().default(""),
    gatedIn: text("gated_in").notNull().default(""), // YYYY-MM-DD
    gatedOut: text("gated_out").notNull().default(""), // YYYY-MM-DD
    detentionExpiry: text("detention_expiry").notNull().default(""), // YYYY-MM-DD
    yardStatus: text("yard_status").notNull().default(""),
    // VGM
    tareKg: doublePrecision("tare_kg"),
    cargoKg: doublePrecision("cargo_kg"),
    vgmMethod: text("vgm_method").notNull().default(""),
    vgmDeclaredBy: text("vgm_declared_by").notNull().default(""),
    vgmDeclaredAt: text("vgm_declared_at").notNull().default(""), // YYYY-MM-DDTHH:MM
    vgmStatus: text("vgm_status").notNull().default(""), // "" | Draft | Submitted
  },
  (table) => [
    ...defaultTableIndexes("warehouse_container", table),
    tenantIndex("warehouse_container", table),
    index("warehouse_container_movement_idx").on(table.movementId),
  ],
);

// A booked slot at one of the warehouse docks.
export const warehouseDockSlotTable = pgTable(
  "warehouse_dock_slot",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    date: text("date").notNull(), // YYYY-MM-DD
    time: text("time").notNull(), // HH:MM
    dock: text("dock").notNull(),
    direction: text("direction").notNull().default("IN"), // IN | OUT
    reference: text("reference").notNull().default(""),
    party: text("party").notNull().default(""),
    vehicle: text("vehicle").notNull().default(""),
    status: text("status").notNull().default("Booked"), // Booked | In progress | Completed | Overdue
    note: text("note").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("warehouse_dock_slot", table), tenantIndex("warehouse_dock_slot", table)],
);

// Shift roster — who works where today.
export const warehouseStaffTable = pgTable(
  "warehouse_staff",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    shift: text("shift").notNull().default(""), // e.g. 06:00–14:00
    area: text("area").notNull().default(""),
    status: text("status").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("warehouse_staff", table), tenantIndex("warehouse_staff", table)],
);

// Handling equipment (forklifts, scales …).
export const warehouseEquipmentTable = pgTable(
  "warehouse_equipment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    code: text("code").notNull(),
    kind: text("kind").notNull().default(""),
    status: text("status").notNull().default("Available"), // Available | In use | Maintenance
    operator: text("operator").notNull().default(""),
    note: text("note").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("warehouse_equipment", table), tenantIndex("warehouse_equipment", table)],
);

// Claims register (damage / shortage), numbered CL-YY-#### per company.
export const warehouseClaimTable = pgTable(
  "warehouse_claim",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    ref: text("ref").notNull(),
    job: text("job").notNull().default(""), // position / house job reference
    against: text("against").notNull().default(""),
    type: text("type").notNull().default(""),
    value: text("value").notNull().default(""), // amount with currency, e.g. "USD 1 240"
    raised: text("raised").notNull().default(""), // YYYY-MM-DD
    status: text("status").notNull().default("Under review"),
  },
  (table) => [...defaultTableIndexes("warehouse_claim", table), tenantIndex("warehouse_claim", table)],
);

// Report library — saved report definitions and who receives them.
export const warehouseSavedReportTable = pgTable(
  "warehouse_saved_report",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    name: text("name").notNull(),
    owner: text("owner").notNull().default(""),
    frequency: text("frequency").notNull().default(""),
    format: text("format").notNull().default("XLSX"),
    distribution: text("distribution").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("warehouse_saved_report", table), tenantIndex("warehouse_saved_report", table)],
);
