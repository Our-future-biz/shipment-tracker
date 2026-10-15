import { pgTable, text, uuid, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export type TruckingEventKind =
  | "settings_updated"
  | "profile_created"
  | "profile_updated"
  | "haulier_blocked"
  | "haulier_unblocked"
  | "tariff_created"
  | "tariff_updated"
  | "tariff_version_created"
  | "tariff_version_imported"
  | "tariff_version_activated"
  | "tariff_version_discarded"
  | "fuel_index_set"
  // Phase 4: consignments and trips
  | "consignment_created"
  | "consignment_updated"
  | "consignment_cancelled"
  | "margin_approved"
  | "stamp_set"
  | "stamp_voided"
  | "ready_to_bill"
  | "trip_created"
  | "trip_updated"
  | "trip_cancelled"
  | "transport_order_printed"
  | "transport_order_sent"
  | "transport_order_confirmed"
  | "transport_order_rejected"
  | "cmr_printed"
  | "document_uploaded"
  | "shipment_deleted"
  | "shipment_update_failed"
  | "costs_update_failed";

/** One changed field: what it was and what it became. */
export interface TruckingFieldChange {
  before: unknown;
  after: unknown;
}

export interface TruckingEventPayload {
  changes: Record<string, TruckingFieldChange>;
  reason?: string;
  /** Tariff events: the tariff and (for version events) the version */
  tariffId?: string;
  versionId?: string;
  /** Imported versions: the uploaded file and what reading it found */
  file?: { name: string; sha256: string; errorCount: number; warningCount: number };
  /** Consignment and trip events: the plain-English line the history shows */
  summary?: string;
  /** Free facts of consignment and trip events (never a Pick-up PIN: only whether one was printed) */
  facts?: Record<string, unknown>;
}

// What happened in trucking: every settings save, every haulier profile save, block and unblock,
// tariff and tariff version change and fuel index change, and (Phase 4) every consignment and
// trip change, stamp, transport order and document,
// with who did it and the before/after of what changed. Append-only: a trigger (migration 0000)
// refuses UPDATE and DELETE, so there is no updated_at / deleted_at.
export const truckingEventTable = pgTable(
  "trucking_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    kind: text("kind").$type<TruckingEventKind>().notNull(),
    /** The haulier (or tariff owner) the event is about; null for settings, Standard / internal tariffs and the fuel index. */
    customerId: uuid("customer_id"),
    /** Phase 4: the consignment and / or trip the event is about. */
    consignmentId: uuid("consignment_id"),
    tripId: uuid("trip_id"),
    byUserId: uuid("by_user_id"),
    /** Display name at the time */
    byName: text("by_name").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<TruckingEventPayload>().notNull(),
  },
  (table) => [
    tenantIndex("trucking_event", table),
    index("trucking_event_customer_idx").on(table.companyId, table.customerId, table.at.desc()),
    index("trucking_event_consignment_idx").on(table.consignmentId, table.at.desc()),
    index("trucking_event_trip_idx").on(table.tripId, table.at.desc()),
  ],
);

export type NewTruckingEventRecord = typeof truckingEventTable.$inferInsert;
