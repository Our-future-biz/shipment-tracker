import { sql } from "drizzle-orm";
import { pgTable, text, integer, numeric, date, boolean, jsonb, uuid, timestamp, index, uniqueIndex, check, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type {
  ConsignmentScope,
  ConsignmentStatus,
  LastMile,
  LegKind,
  LegStatus,
  LoadInput,
  PricedSide,
  PriceSnapshot,
  ConsignmentNotice,
  ServiceLevelCode,
  Stop,
  TripKind,
  TripStatus,
  TruckingDocumentKind,
} from "../interfaces/interfaces";
import type { AvizaceRecord } from "../interfaces/avizace.interfaces";

/** TCZ = consignment, LCZ = trip (load), ICZ = internal statement (Phase 6, 4 digits). */
export type TruckingRefSequence = "TCZ" | "LCZ" | "ICZ";

// The last consignment / trip / internal statement number handed out per company, sequence and
// Prague calendar year (TCZ / LCZ + year + six digits, ICZ + year + four digits). One row is bumped atomically per new consignment or trip; the
// row stays locked until the creating transaction ends, so two creates never get one number.
export const truckingRefCounterTable = pgTable(
  "trucking_ref_counter",
  {
    companyId: uuid("company_id").notNull(),
    sequence: text("sequence").$type<TruckingRefSequence>().notNull(),
    year: integer("year").notNull(),
    last: integer("last").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.sequence, table.year] }),
    check("trucking_ref_counter_sequence_check", sql`${table.sequence} IN ('TCZ', 'LCZ', 'ICZ')`),
  ],
);

/** A manager's approval of a margin below the floor. */
export interface StoredMarginApproval {
  byUserId: string;
  byName: string;
  at: string;
  reason: string;
  /** The margin approved (CZK); null when it could not be worked out then. */
  marginCzk: number | null;
}

// One road consignment: what a customer orders us to move, always under a Shipments job
// (shipment_id, another database: bare uuid). FTL = one consignment on one trip; LTL (Phase 5) =
// legs through our warehouse (pick-up run, line haul, delivery run or a partner's delivery), the
// gate-in / gate-out heard from the warehouse.
// Stops and load are jsonb documents written and read as a whole. `status` is derived from the
// stamps and the trip on every write (lib/consignmentRules.ts) and stored for lists. Stamps are
// set once by a guarded UPDATE (… WHERE <stamp>_at IS NULL); a manager may void one (event kept).
// `version` is bumped by every write, so a stale edit is refused.
export const truckingConsignmentTable = pgTable(
  "trucking_consignment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    ref: text("ref").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    jobNumber: text("job_number").notNull().default(""),
    customerId: uuid("customer_id").notNull(),
    customerName: text("customer_name").notNull().default(""),
    quoteNumber: text("quote_number"),
    scope: text("scope").$type<ConsignmentScope>().notNull().default("FTL"),
    /** LTL: the customer brings the goods to our warehouse (no pick-up leg) */
    selfDelivered: boolean("self_delivered").notNull().default(false),
    /** LTL: who delivers the last mile; null for FTL */
    lastMile: text("last_mile").$type<LastMile>(),
    partnerHaulierCustomerId: uuid("partner_haulier_customer_id"),
    /** LTL: the gate-in / gate-out at our warehouse as the warehouse confirmed them */
    gateInAt: timestamp("gate_in_at", { withTimezone: true }),
    gateOutAt: timestamp("gate_out_at", { withTimezone: true }),
    /** LTL: the promised date counts from the confirmed gate-in (else it is an estimate) */
    promisedFinal: boolean("promised_final").notNull().default(false),
    serviceLevel: text("service_level").$type<ServiceLevelCode>(),
    status: text("status").$type<ConsignmentStatus>().notNull().default("BOOKED"),
    pickupDate: date("pickup_date", { mode: "string" }).notNull(),
    pickupTime: text("pickup_time"),
    pickup: jsonb("pickup").$type<Stop>().notNull(),
    delivery: jsonb("delivery").$type<Stop>().notNull(),
    load: jsonb("load").$type<LoadInput>().notNull(),
    promisedDate: date("promised_date", { mode: "string" }),
    chargeableKg: numeric("chargeable_kg", { precision: 12, scale: 2, mode: "number" }),
    sell: jsonb("sell").$type<PriceSnapshot>(),
    sellCzk: numeric("sell_czk", { precision: 14, scale: 2, mode: "number" }),
    /** The cheapest usable buy price when the consignment was priced (before a trip has its own) */
    estBuyCzk: numeric("est_buy_czk", { precision: 14, scale: 2, mode: "number" }),
    belowFloor: boolean("below_floor").notNull().default(false),
    marginApproval: jsonb("margin_approval").$type<StoredMarginApproval>(),
    tripId: uuid("trip_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by"),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    pickedUpBy: text("picked_up_by"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredBy: text("delivered_by"),
    podReceivedAt: timestamp("pod_received_at", { withTimezone: true }),
    podReceivedBy: text("pod_received_by"),
    podSource: text("pod_source").$type<"USER" | "HAULIER">(),
    /** Every live consignment of the job has its POD: the job went to Billing */
    readyToBillAt: timestamp("ready_to_bill_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdByUserId: uuid("created_by_user_id"),
    /** Phase 6: the job's department (Shipments), refreshed until the POD is in (then frozen) */
    department: text("department").notNull().default(""),
    /** Phase 6: the job is another department's: billed internally (lib/internalRules.ts); frozen once the POD is in */
    internal: boolean("internal").notNull().default(false),
    /** What needs someone's look that no state shows (a price change after the invoice, a credit from the haulier); cleared by a manager */
    notices: jsonb("notices").$type<ConsignmentNotice[]>().notNull().default([]),
    /** Phase 6: the avizace recorded last */
    avizace: jsonb("avizace").$type<AvizaceRecord>(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("trucking_consignment", table),
    tenantIndex("trucking_consignment", table),
    uniqueIndex("trucking_consignment_ref_unique").on(table.companyId, table.ref),
    index("trucking_consignment_shipment_idx").on(table.companyId, table.shipmentId),
    index("trucking_consignment_status_idx").on(table.companyId, table.status, table.pickupDate),
    index("trucking_consignment_trip_idx").on(table.tripId),
    // A customer renamed in the Customer Database is written on its consignments (customerLinks).
    index("trucking_consignment_customer_idx").on(table.companyId, table.customerId),
    // The trip table is declared below; the callback runs after the module has loaded.
    foreignKey({ name: "trucking_consignment_trip_fk", columns: [table.tripId], foreignColumns: [truckingTripTable.id] }).onDelete("restrict"),
    // One live consignment per quote it is priced from (decision 10); a cancelled one frees the quote.
    uniqueIndex("trucking_consignment_quote_unique")
      .on(table.companyId, table.quoteNumber)
      .where(sql`quote_number IS NOT NULL AND cancelled_at IS NULL AND deleted_at IS NULL AND sell->>'source' = 'QUOTE'`),
    check("trucking_consignment_scope_check", sql`${table.scope} IN ('FTL', 'LTL')`),
    check("trucking_consignment_last_mile_check", sql`${table.lastMile} IS NULL OR ${table.lastMile} IN ('OWN_RUN', 'PARTNER')`),
    check(
      "trucking_consignment_status_check",
      sql`${table.status} IN ('BOOKED', 'PLANNED', 'ORDERED', 'CONFIRMED', 'PICKED_UP', 'AT_HUB', 'ON_LINEHAUL', 'OUT_FOR_DELIVERY', 'DELIVERED', 'POD_RECEIVED', 'READY_TO_BILL', 'CANCELLED')`,
    ),
    check("trucking_consignment_pod_source_check", sql`${table.podSource} IS NULL OR ${table.podSource} IN ('USER', 'HAULIER')`),
    check("trucking_consignment_ref_check", sql`${table.ref} ~ '^TCZ[0-9]{10}$'`),
    // Stamps in order: a later one stands only on the earlier (void the later one first). An LTL
    // consignment the customer brought to our warehouse has a gate-in instead of a pick-up.
    check(
      "trucking_consignment_stamp_order_check",
      sql`(${table.deliveredAt} IS NULL OR ${table.pickedUpAt} IS NOT NULL OR ${table.gateInAt} IS NOT NULL) AND (${table.podReceivedAt} IS NULL OR ${table.deliveredAt} IS NOT NULL) AND (${table.readyToBillAt} IS NULL OR ${table.podReceivedAt} IS NOT NULL)`,
    ),
    check("trucking_consignment_cancelled_check", sql`(${table.status} = 'CANCELLED') = (${table.cancelledAt} IS NOT NULL)`),
  ],
);

// One truck run with a subcontracted haulier. FTL: exactly one consignment (through one leg).
// LTL (Phase 5): a pick-up run, line haul or delivery run carrying many legs in `stop_order`; its
// buy price is split over the legs (leg.cost_share_czk). `cost_jobs` / `warehouse_jobs` remember
// which jobs were last sent cost lines / announced to the warehouse, so a job taken off the trip
// gets its lines removed and its expected arrival / departure cancelled. The row is locked FOR
// UPDATE while its legs change. The transport order is part of the trip: its number is the trip ref; sending records
// who and when (e-mail is off, so "recorded only"), the haulier answers through the link or a
// user records the answer. The Pick-up PIN is never stored: only whether one was printed.
export const truckingTripTable = pgTable(
  "trucking_trip",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    ref: text("ref").notNull(),
    kind: text("kind").$type<TripKind>().notNull().default("FTL"),
    status: text("status").$type<TripStatus>().notNull().default("DRAFT"),
    /** LTL: leg ids in the order of the stops */
    stopOrder: jsonb("stop_order").$type<string[]>().notNull().default([]),
    departedAt: timestamp("departed_at", { withTimezone: true }),
    departedBy: text("departed_by"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    arrivedBy: text("arrived_by"),
    costJobs: jsonb("cost_jobs").$type<TripJobRef[]>().notNull().default([]),
    warehouseJobs: jsonb("warehouse_jobs").$type<TripJobRef[]>().notNull().default([]),
    haulierCustomerId: uuid("haulier_customer_id").notNull(),
    haulierName: text("haulier_name").notNull().default(""),
    /** The engine's first candidate when the trip was made (null = none); differs from the haulier when the user chose another */
    suggestedHaulierId: uuid("suggested_haulier_id"),
    vehicleTypeCode: text("vehicle_type_code"),
    tractorPlate: text("tractor_plate").notNull().default(""),
    trailerPlate: text("trailer_plate").notNull().default(""),
    driverName: text("driver_name").notNull().default(""),
    driverPhone: text("driver_phone").notNull().default(""),
    plannedPickupDate: date("planned_pickup_date", { mode: "string" }).notNull(),
    buy: jsonb("buy").$type<PriceSnapshot>(),
    buyCzk: numeric("buy_czk", { precision: 14, scale: 2, mode: "number" }),
    buyCandidates: jsonb("buy_candidates").$type<PricedSide[]>().notNull().default([]),
    /** A manager changed the buy price after the transport order was sent (owner decision 7): kept out of invoice auto-approval */
    buyRepricedAt: timestamp("buy_repriced_at", { withTimezone: true }),
    buyRepricedBy: text("buy_repriced_by"),
    orderSentAt: timestamp("order_sent_at", { withTimezone: true }),
    orderSentBy: text("order_sent_by"),
    /** Who sent the transport order: updates the haulier's link causes are sent to Shipments as this user */
    orderSentByUserId: uuid("order_sent_by_user_id"),
    orderSentByRole: text("order_sent_by_role"),
    orderRecordedOnly: boolean("order_recorded_only").notNull().default(false),
    orderTo: jsonb("order_to").$type<string[]>().notNull().default([]),
    pinPrinted: boolean("pin_printed").notNull().default(false),
    /** Our company name as printed on the transport order (shown on the haulier's page) */
    ourCompanyName: text("our_company_name").notNull().default(""),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedVia: text("confirmed_via").$type<"LINK" | "USER">(),
    confirmedBy: text("confirmed_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdByUserId: uuid("created_by_user_id"),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("trucking_trip", table),
    tenantIndex("trucking_trip", table),
    uniqueIndex("trucking_trip_ref_unique").on(table.companyId, table.ref),
    index("trucking_trip_status_idx").on(table.companyId, table.status, table.plannedPickupDate),
    // A haulier's trips: its portal, and its rename in the Customer Database (customerLinks).
    index("trucking_trip_haulier_idx").on(table.companyId, table.haulierCustomerId),
    check("trucking_trip_kind_check", sql`${table.kind} IN ('FTL', 'PICKUP_RUN', 'LINEHAUL', 'DELIVERY_RUN')`),
    check("trucking_trip_status_check", sql`${table.status} IN ('DRAFT', 'ORDERED', 'CONFIRMED', 'IN_TRANSIT', 'DONE', 'CANCELLED')`),
    check("trucking_trip_confirmed_via_check", sql`${table.confirmedVia} IS NULL OR ${table.confirmedVia} IN ('LINK', 'USER')`),
    check("trucking_trip_ref_check", sql`${table.ref} ~ '^LCZ[0-9]{10}$'`),
  ],
);

/** A job a trip carries (or carried) and one of its consignments (the outbox row's consignment). */
export interface TripJobRef {
  shipmentId: string;
  consignmentId: string;
}

// A consignment's part of the road. FTL: exactly one DIRECT leg per consignment on its trip (a
// cancelled trip's leg is soft-deleted). LTL: PICKUP (origin → our warehouse, unless the customer
// brings the goods), LINEHAUL (our warehouse → a partner's depot) and DELIVERY (→ consignee) by
// `seq` 1 / 2 / 3. A leg waits OPEN until it is on a trip (or, for a partner's delivery, priced
// with the partner), then PLANNED, then DONE.
export const truckingLegTable = pgTable(
  "trucking_leg",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    consignmentId: uuid("consignment_id").notNull(),
    tripId: uuid("trip_id"),
    seq: integer("seq").notNull().default(1),
    kind: text("kind").$type<"DIRECT" | LegKind>().notNull().default("DIRECT"),
    status: text("status").$type<LegStatus>().notNull().default("OPEN"),
    fromText: text("from_text").notNull().default(""),
    toText: text("to_text").notNull().default(""),
    /** The leg's ends as rated (CZ: 5 digits) */
    fromPostcode: text("from_postcode").notNull().default(""),
    toPostcode: text("to_postcode").notNull().default(""),
    haulierCustomerId: uuid("haulier_customer_id"),
    depotSiteId: uuid("depot_site_id"),
    buy: jsonb("buy").$type<PriceSnapshot>(),
    /** A partner delivery's price changed by a manager after the partner was given it: kept out of invoice auto-approval */
    buyRepricedAt: timestamp("buy_repriced_at", { withTimezone: true }),
    buyRepricedBy: text("buy_repriced_by"),
    costShareCzk: numeric("cost_share_czk", { precision: 14, scale: 2, mode: "number" }),
  },
  (table) => [
    ...defaultTableIndexes("trucking_leg", table),
    tenantIndex("trucking_leg", table),
    index("trucking_leg_consignment_idx").on(table.consignmentId),
    index("trucking_leg_trip_idx").on(table.tripId),
    uniqueIndex("trucking_leg_live_unique").on(table.consignmentId, table.seq).where(sql`deleted_at IS NULL`),
    foreignKey({ name: "trucking_leg_consignment_fk", columns: [table.consignmentId], foreignColumns: [truckingConsignmentTable.id] }).onDelete("restrict"),
    foreignKey({ name: "trucking_leg_trip_fk", columns: [table.tripId], foreignColumns: [truckingTripTable.id] }).onDelete("restrict"),
    check("trucking_leg_kind_check", sql`${table.kind} IN ('DIRECT', 'PICKUP', 'LINEHAUL', 'DELIVERY')`),
    check("trucking_leg_status_check", sql`${table.status} IN ('OPEN', 'PLANNED', 'DONE')`),
    // A leg on a trip is planned or done.
    check("trucking_leg_trip_check", sql`${table.tripId} IS NULL OR ${table.status} <> 'OPEN'`),
  ],
);

// The haulier's link to a transport order (confirm / reject, POD upload). Only the SHA-256 of the
// 32-byte random token is stored; the token itself is printed on the transport order once. A
// renewed link revokes the old one.
export const truckingHaulierLinkTable = pgTable(
  "trucking_haulier_link",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    tripId: uuid("trip_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("trucking_haulier_link", table),
    tenantIndex("trucking_haulier_link", table),
    uniqueIndex("trucking_haulier_link_token_unique").on(table.tokenHash),
    index("trucking_haulier_link_trip_idx").on(table.tripId),
    foreignKey({ name: "trucking_haulier_link_trip_fk", columns: [table.tripId], foreignColumns: [truckingTripTable.id] }).onDelete("restrict"),
    check("trucking_haulier_link_hash_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

// Files of a consignment (POD, CMR, delivery note, other): metadata here, bytes in the bucket
// trucking-documents under storage_key. content_type is what the bytes are (sniffed), never what
// the client claimed.
export const truckingDocumentTable = pgTable(
  "trucking_document",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    consignmentId: uuid("consignment_id").notNull(),
    kind: text("kind").$type<TruckingDocumentKind>().notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    source: text("source").$type<"USER" | "HAULIER">().notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    uploadedBy: text("uploaded_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("trucking_document", table),
    tenantIndex("trucking_document", table),
    index("trucking_document_consignment_idx").on(table.consignmentId),
    foreignKey({ name: "trucking_document_consignment_fk", columns: [table.consignmentId], foreignColumns: [truckingConsignmentTable.id] }).onDelete("restrict"),
    check("trucking_document_kind_check", sql`${table.kind} IN ('POD', 'CMR', 'DELIVERY_NOTE', 'OTHER')`),
    check("trucking_document_source_check", sql`${table.source} IN ('USER', 'HAULIER')`),
  ],
);

export type TruckingConsignmentRecord = typeof truckingConsignmentTable.$inferSelect;
export type NewTruckingConsignmentRecord = typeof truckingConsignmentTable.$inferInsert;
export type TruckingTripRecord = typeof truckingTripTable.$inferSelect;
export type NewTruckingTripRecord = typeof truckingTripTable.$inferInsert;
export type TruckingLegRecord = typeof truckingLegTable.$inferSelect;
export type NewTruckingLegRecord = typeof truckingLegTable.$inferInsert;
export type TruckingHaulierLinkRecord = typeof truckingHaulierLinkTable.$inferSelect;
export type TruckingDocumentRecord = typeof truckingDocumentTable.$inferSelect;
export type NewTruckingDocumentRecord = typeof truckingDocumentTable.$inferInsert;

// The warehouse's gate stamps Trucking has heard (topic warehouse-gate-stamped), one row per
// (position, kind, time): a message delivered twice is applied once.
export const truckingGateEventTable = pgTable(
  "trucking_gate_event",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id"),
    positionId: text("position_id").notNull(),
    wczRef: text("wcz_ref").notNull().default(""),
    kind: text("kind").$type<"gateIn" | "gateOut" | "voided">().notNull(),
    stampKind: text("stamp_kind").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull(),
    userId: text("user_id").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("trucking_gate_event", table),
    tenantIndex("trucking_gate_event", table),
    uniqueIndex("trucking_gate_event_unique").on(table.companyId, table.positionId, table.kind, table.at),
    check("trucking_gate_event_kind_check", sql`${table.kind} IN ('gateIn', 'gateOut', 'voided')`),
  ],
);
