import { sql } from "drizzle-orm";
import { pgTable, text, integer, uuid, index, timestamp, jsonb, uniqueIndex, numeric, foreignKey, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { GateEvent } from "./gateMovement.schema";
import { gateMovementTable } from "./gateMovement.schema";
import { warehouseTaskTable } from "./warehouseTask.schema";

// Warehouse module records behind the Containers, Dock & Yard and Reports tabs.

// A container handled by the warehouse: its register data, the devanning / stuffing
// schedule, its time on our yard (with the carrier's detention expiry) and its VGM.
// One container holds many positions (houses) through warehouse_container_position: an import
// container (direction Unloading) is stripped and tallied house by house, an export container
// (Loading) is stuffed from a plan. Its gate-in / stripping / close / gate-out are real stamps
// (time, who; never edited, only voided by a manager), logged in `events`.
export const warehouseContainerTable = pgTable(
  "warehouse_container",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    // Legacy: the one position a container belonged to before containers held many. Kept (and
    // still written by the register form) so old rows keep their survey link; the house list
    // is warehouse_container_position.
    movementId: uuid("movement_id"),
    number: text("number").notNull(), // e.g. "MSKU 611 902-7"
    equipment: text("equipment").notNull().default(""), // 20' DV · 40' HC …
    seal: text("seal").notNull().default(""),
    pieces: integer("pieces"),
    packages: text("packages").notNull().default(""),
    weightKg: numeric("weight_kg", { precision: 12, scale: 3, mode: "number" }),
    cbm: numeric("cbm", { precision: 12, scale: 3, mode: "number" }),
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
    tareKg: numeric("tare_kg", { precision: 12, scale: 3, mode: "number" }),
    cargoKg: numeric("cargo_kg", { precision: 12, scale: 3, mode: "number" }),
    vgmMethod: text("vgm_method").notNull().default(""),
    vgmDeclaredBy: text("vgm_declared_by").notNull().default(""),
    vgmDeclaredAt: text("vgm_declared_at").notNull().default(""), // YYYY-MM-DDTHH:MM
    vgmStatus: text("vgm_status").notNull().default(""), // "" | Draft | Submitted
    // Booking / master B/L and the sailing of the box.
    bookingNumber: text("booking_number").notNull().default(""),
    mblNumber: text("mbl_number").notNull().default(""),
    vessel: text("vessel").notNull().default(""),
    voyage: text("voyage").notNull().default(""),
    // Stamps of the container itself (set once by a conditional UPDATE, voided only by a manager).
    gateInAt: timestamp("gate_in_at", { withTimezone: true }),
    strippingStartedAt: timestamp("stripping_started_at", { withTimezone: true }),
    // Export: stuffing closed, with the seal recorded.
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by").notNull().default(""),
    gateOutAt: timestamp("gate_out_at", { withTimezone: true }),
    // The truck that takes the container away (sent to the shipments of the stuffed positions).
    plate: text("plate").notNull().default(""),
    events: jsonb("events").$type<GateEvent[]>().notNull().default([]),
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_container", table),
    tenantIndex("warehouse_container", table),
    index("warehouse_container_movement_idx").on(table.movementId),
    foreignKey({ name: "wh_container_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
  ],
);

/** Outcome of a house at the stripping tally: "" not tallied yet. */
export type TallyOutcome = "" | "received" | "short" | "not_arrived";

// One position (house) in a container. A position is in at most one container at a time (the
// live unique index); taking it out is a soft delete, so the history stays. Export: planned,
// then stuffed. Import: tallied at stripping — ticked received (the receipt of the house), or
// short / not arrived with a reason.
export const warehouseContainerPositionTable = pgTable(
  "warehouse_container_position",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    containerId: uuid("container_id").notNull(),
    movementId: uuid("movement_id").notNull(),
    taskId: uuid("task_id"),
    sequence: integer("sequence").notNull().default(0),
    addedBy: text("added_by").notNull().default(""),
    // Export stuffing.
    stuffedAt: timestamp("stuffed_at", { withTimezone: true }),
    stuffedBy: text("stuffed_by").notNull().default(""),
    // Import stripping tally.
    tallyOutcome: text("tally_outcome").$type<TallyOutcome>().notNull().default(""),
    tallyPieces: integer("tally_pieces"),
    tallyCondition: text("tally_condition").notNull().default(""),
    tallyLocation: text("tally_location").notNull().default(""),
    tallyNote: text("tally_note").notNull().default(""),
    tallyReason: text("tally_reason").notNull().default(""),
    tickedAt: timestamp("ticked_at", { withTimezone: true }),
    tickedBy: text("ticked_by").notNull().default(""),
    // Floor mode: id of the phone request that last stuffed / tallied the house.
    clientRequestId: text("client_request_id"),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_container_position", table),
    tenantIndex("warehouse_container_position", table),
    index("warehouse_container_position_container_idx").on(table.containerId),
    uniqueIndex("warehouse_container_position_live_unique").on(table.companyId, table.movementId).where(sql`deleted_at IS NULL`),
    uniqueIndex("warehouse_container_position_request_unique")
      .on(table.companyId, table.containerId, table.clientRequestId)
      .where(sql`client_request_id IS NOT NULL`),
    foreignKey({ name: "wh_container_position_container_fk", columns: [table.containerId], foreignColumns: [warehouseContainerTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_container_position_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_container_position_task_fk", columns: [table.taskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    index("wh_container_position_movement_idx").on(table.movementId),
    index("wh_container_position_task_idx").on(table.taskId),
    check("wh_container_position_tally_check", sql`${table.tallyOutcome} IN ('', 'received', 'short', 'not_arrived')`),
  ],
);

export type WarehouseContainerRecord = typeof warehouseContainerTable.$inferSelect;
export type ContainerPositionRecord = typeof warehouseContainerPositionTable.$inferSelect;
export type NewContainerPositionRecord = typeof warehouseContainerPositionTable.$inferInsert;

// A booked slot at one of the warehouse docks, linked to the position's gate movement.
// No double booking: migration 0016 adds the EXCLUDE constraint warehouse_dock_slot_no_overlap
// (same company, same dock, overlapping [starts_at, ends_at) of live slots that are not
// Cancelled or Completed). drizzle-kit cannot model it, so it is not in this schema or the
// snapshot — a later generate does not drop it.
export const warehouseDockSlotTable = pgTable(
  "warehouse_dock_slot",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    // Gate movement (position) the slot is for; null only on slots booked before the link existed.
    movementId: uuid("movement_id"),
    date: text("date").notNull(), // YYYY-MM-DD (Prague)
    time: text("time").notNull(), // HH:MM (Prague)
    durationMin: integer("duration_min").notNull().default(60),
    // The slot as instants (from date, time and duration in Prague time); what the overlap rule uses.
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    dock: text("dock").notNull(),
    direction: text("direction").notNull().default("IN"), // IN | OUT
    reference: text("reference").notNull().default(""),
    party: text("party").notNull().default(""),
    vehicle: text("vehicle").notNull().default(""),
    status: text("status").notNull().default("Booked"), // Booked | In progress | Completed | Overdue | Cancelled
    note: text("note").notNull().default(""),
    // The Trucking trip (LCZ…) that booked the slot through expect-arrival / expect-departure;
    // "" for slots booked by hand. A trip's cancel frees only its own slots.
    tripRef: text("trip_ref").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_dock_slot", table),
    index("warehouse_dock_slot_trip_idx").on(table.movementId, table.tripRef).where(sql`trip_ref <> ''`),
    tenantIndex("warehouse_dock_slot", table),
    index("warehouse_dock_slot_movement_idx").on(table.movementId),
    foreignKey({ name: "wh_dock_slot_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    check("wh_dock_slot_status_check", sql`${table.status} IN ('Booked', 'In progress', 'Completed', 'Overdue', 'Cancelled')`),
    check("wh_dock_slot_direction_check", sql`${table.direction} IN ('IN', 'OUT')`),
  ],
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
