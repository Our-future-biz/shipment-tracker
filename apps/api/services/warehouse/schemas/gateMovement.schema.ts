import { pgTable, text, integer, boolean, uuid, jsonb, timestamp, index, numeric, foreignKey, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { GateCustomsMode, GateCustomsStatus, GateHandling, GateOperationType, GateVisit } from "../interfaces/gate.interfaces";
import { sql } from "drizzle-orm";
import { warehouseTaskTable } from "./warehouseTask.schema";

// Checklist icon state: g done · a pending · r problem · n n/a.
export type GateCheckState = "g" | "a" | "r" | "n";
export type GateChecklist = Record<"ht" | "photos" | "measure" | "vgm" | "seal" | "dg", GateCheckState>;

// One line of the release-gate panel. Release is armed only when every line is OK
// (the empty-return line is ignored for cargo release).
export interface GateReleaseLine {
  g: string;
  s: "OK" | "Pending" | "Blocked";
  note: string;
}

// Transport legs shown on the movement overview: in, out and the CFS haulage.
export interface GateTransportLeg {
  leg: "IN" | "OUT" | "CFS";
  company: string;
  plate: string;
  driver: string;
  phone: string; // driver's phone number
  gateTime: string; // free text or ISO; empty falls back to the gate-in / gate-out stamp
  // Filled by a Trucking trip (expect-arrival / expect-departure): read-only in Warehouse and
  // Shipments, cleared only by that trip's cancel. Absent on legs typed by hand.
  source?: GateTripSource | null;
}

/** What a Trucking trip filled (transport leg, pick-up row, dock slot): "From trip LCZ…". */
export interface GateTripSource {
  kind: "trucking";
  tripRef: string;
}

// Cargo survey — one record per container ("" = position level when there is none).
export interface GateSurveyLine {
  qty: number | null;
  outerPacking: string;
  visual: string[];
  inner: string[];
}

export interface GateSurvey {
  container: string;
  phase: string;
  damaged: number;
  lost: number;
  lines: GateSurveyLine[];
  driverNote: string;
  warehouseNote: string;
  surveyedAt: string;
  surveyedBy: string;
  /** Id of the phone request that saved it (floor mode), so a replay is recognised. */
  requestId?: string;
}

// One drop / run of the position (WCZ…-1, -2 …), numbered by its order.
export interface GateSubPosition {
  etw: string; // YYYY-MM-DD
  qty: number | null;
  packing: string;
  width: number | null; // cm
  length: number | null; // cm
  height: number | null; // cm
  description: string;
  weight: number | null; // kg
  measure: number | null; // cbm
  totalGross: number | null; // kg
  plate: string; // SPZ
  driver: string;
  transport: string;
  vgm: boolean;
  vgmDate: string;
  storageDays: number | null;
}

// Append-only log of what happened at the gate; stamps are never edited, only added.
export interface GateEvent {
  kind: string;
  label: string;
  at: string;
  by: string;
  detail?: string;
  /** Id of the phone request that made it (floor mode), so a replay is recognised. */
  requestId?: string;
  /** The value the event replaced (e.g. the typed received date a tally tick overwrote), restored when it is voided. */
  previous?: string;
}

// Gate desk row: one expected movement (a position, a delivery run or a container)
// passing the warehouse gate. Carrier, driver and plate are written here once.
export const gateMovementTable = pgTable(
  "warehouse_gate_movement",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    gateRef: text("gate_ref").notNull(),
    warehouseTaskId: uuid("warehouse_task_id"),
    // The shipment whose pick-up PIN releases this outbound cargo, fixed when the row is made (or
    // re-linked by a manager with a reason). While set, the WH release needs the Pick-up PIN line
    // OK even if the task link went away — unlinking the position never skips the PIN.
    pickupShipmentId: uuid("pickup_shipment_id"),
    visit: text("visit").$type<GateVisit>().notNull().default("příjem"), // příjem (in) | výdej (out)
    handling: text("handling").$type<GateHandling>().notNull().default("Import"),
    operationType: text("operation_type").$type<GateOperationType>().notNull().default("LCL consolidation"),
    customsMode: text("customs_mode").$type<GateCustomsMode>().notNull().default("SCP"),
    customer: text("customer").notNull().default(""),
    customerRef: text("customer_ref").notNull().default(""),
    customerContact: text("customer_contact").notNull().default(""),
    shipmentOwner: text("shipment_owner").notNull().default(""),
    colli: integer("colli").notNull().default(0),
    packing: text("packing").notNull().default(""),
    weightKg: numeric("weight_kg", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
    measureCbm: numeric("measure_cbm", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
    customsDocs: text("customs_docs").notNull().default(""),
    mrn: text("mrn").notNull().default(""),
    customsStatus: text("customs_status").$type<GateCustomsStatus>().notNull().default("Waiting For Commercial Paperwork"),
    freightMode: text("freight_mode").notNull().default(""),
    loadType: text("load_type").notNull().default(""),
    commodity: text("commodity").notNull().default(""),
    stackable: boolean("stackable"),
    dangerousGoods: boolean("dangerous_goods"),
    customerContactPhone: text("customer_contact_phone").notNull().default(""),
    unNumber: text("un_number").notNull().default(""),
    // Copied once from the shipment job when the position was recorded; never synced back.
    // (Only the gate stamps write to the shipment: its warehouse dates, reference and plate.)
    jobNumber: text("job_number").notNull().default(""),
    pol: text("pol").notNull().default(""),
    pod: text("pod").notNull().default(""),
    etd: text("etd").notNull().default(""),
    eta: text("eta").notNull().default(""),
    vessel: text("vessel").notNull().default(""),
    voyage: text("voyage").notNull().default(""),
    containerNumber: text("container_number").notNull().default(""),
    sealNumber: text("seal_number").notNull().default(""),
    bookingNumber: text("booking_number").notNull().default(""),
    hblNumber: text("hbl_number").notNull().default(""),
    mblNumber: text("mbl_number").notNull().default(""),
    // Argon2 hash — the PIN itself is never stored or returned.
    pinHash: text("pin_hash"),
    pinTries: integer("pin_tries").notNull().default(0),
    slot: text("slot").notNull().default(""),
    carrier: text("carrier").notNull().default(""),
    driver: text("driver").notNull().default(""),
    plate: text("plate").notNull().default(""),
    status: text("status").notNull().default("Expected"),
    gateIn: timestamp("gate_in", { withTimezone: true }),
    gateOut: timestamp("gate_out", { withTimezone: true }),
    impRelease: timestamp("imp_release", { withTimezone: true }),
    expDraft: timestamp("exp_draft", { withTimezone: true }),
    expReceipt: timestamp("exp_receipt", { withTimezone: true }),
    // Import (výdej) house ticked received at the stripping tally of its container; starts the
    // storage clock (it also sets loadInDate to the Prague day).
    receivedAt: timestamp("received_at", { withTimezone: true }),
    // Export (příjem) cargo that left stuffed in a container: the container's gate-out. Stops the
    // storage clock; the status becomes Released without a WH release.
    leftAt: timestamp("left_at", { withTimezone: true }),
    // → warehouse_container.id: the FK is hand-written in migration 0020 (a schema reference
    // both ways between the two tables would make their TypeScript types circular).
    leftContainerId: uuid("left_container_id"),
    checklist: jsonb("checklist").$type<GateChecklist>().notNull(),
    releaseGates: jsonb("release_gates").$type<GateReleaseLine[]>().notNull(),
    // CFS haulage paperwork.
    cfsCustomsNumber: text("cfs_customs_number").notNull().default(""),
    cfsCustomsProcedure: text("cfs_customs_procedure").notNull().default(""),
    // Legacy: release once picked by hand in the gate log. No longer read or written — release
    // follows the release gates only (migration 0013 cleared the values and logged them).
    releaseStatus: text("release_status").notNull().default(""),
    overridden: boolean("overridden").notNull().default(false),
    refusalLog: text("refusal_log").notNull().default(""),
    overrideLog: text("override_log").notNull().default(""),
    loadInDate: text("load_in_date").notNull().default(""), // YYYY-MM-DD
    freeDays: integer("free_days"),
    note: text("note").notNull().default(""),
    events: jsonb("events").$type<GateEvent[]>().notNull(),
    transportLegs: jsonb("transport_legs").$type<GateTransportLeg[]>().notNull().default([]),
    surveys: jsonb("surveys").$type<GateSurvey[]>().notNull().default([]),
    subPositions: jsonb("sub_positions").$type<GateSubPosition[]>().notNull().default([]),
    updatedBy: text("updated_by").notNull().default(""),
    // Archived (soft-deleted) by whom and why; a stamped record is only archived by a manager.
    archivedBy: text("archived_by").notNull().default(""),
    archiveReason: text("archive_reason").notNull().default(""),
    // When the linked shipment's customs status was last read (customs follow).
    shipmentCheckedAt: timestamp("shipment_checked_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_gate_movement", table),
    tenantIndex("warehouse_gate_movement", table),
    index("warehouse_gate_movement_task_idx").on(table.warehouseTaskId),
    foreignKey({ name: "wh_gate_movement_task_fk", columns: [table.warehouseTaskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    check("wh_gate_movement_visit_check", sql`${table.visit} IN ('příjem', 'výdej')`),
    check("wh_gate_movement_handling_check", sql`${table.handling} IN ('Import', 'Export', 'Domestic')`),
    check("wh_gate_movement_operation_type_check", sql`${table.operationType} IN ('LCL consolidation', 'FCL stuffing', 'FCL stripping', 'FCL transload (cross-stuff)', 'Cargo storage', 'Cargo storage (bonded)', 'Container yard storage')`),
    check("wh_gate_movement_customs_mode_check", sql`${table.customsMode} IN ('SCP', 'JSD', 'T1', 'T2L', 'ATA Carnet', 'RDT', 'C-Goods')`),
    check("wh_gate_movement_customs_status_check", sql`${table.customsStatus} IN ('Waiting For Commercial Paperwork', 'Paperwork Verification Pending', 'Paperwork Verified', 'Under Customs Clearance', 'Customs Cleared/Released')`),
    check("wh_gate_movement_status_check", sql`${table.status} IN ('Expected', 'In Warehouse', 'Released', 'Refused')`),
    check("wh_gate_movement_figures_check", sql`${table.colli} >= 0 AND ${table.weightKg} >= 0 AND ${table.measureCbm} >= 0`),
    index("wh_gate_movement_pickup_shipment_idx").on(table.pickupShipmentId),
  ],
);

export type GateMovementRecord = typeof gateMovementTable.$inferSelect;
export type NewGateMovementRecord = typeof gateMovementTable.$inferInsert;
