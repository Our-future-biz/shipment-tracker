import { sql } from "drizzle-orm";
import { pgTable, text, integer, numeric, jsonb, uuid, timestamp, index, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { ExceptionCause, ExceptionDecision, ExceptionKind, FailedReason } from "../interfaces/avizace.interfaces";
import { truckingConsignmentTable, truckingLegTable } from "./truckingConsignment.schema";

/** What a CLAIM_HAULIER decision claims against: an FTL / LTL trip, or a partner's delivery leg. */
export type ClaimTargetKind = "TRIP" | "PARTNER_LEG";

// A delivery exception of a consignment (Phase 6): a failed delivery, damage, shortage, overage,
// waiting time, a redelivery or anything else. It is created PENDING, then decided (charge the
// customer, claim from the haulier, absorb; a manager for anything that costs money) and closed.
// While it is not closed the consignment cannot become ready to bill. A CLAIM_HAULIER decision
// records its target (claim_target_*) so the haulier invoice match can take the claim off the
// expected cost. `version` is bumped by every write. Photos are trucking_document rows (kind
// OTHER) listed here as { id, fileName }.
export const truckingExceptionTable = pgTable(
  "trucking_exception",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    consignmentId: uuid("consignment_id").notNull(),
    legId: uuid("leg_id"),
    kind: text("kind").$type<ExceptionKind>().notNull(),
    failedReason: text("failed_reason").$type<FailedReason>(),
    cause: text("cause").$type<ExceptionCause>().notNull().default("UNKNOWN"),
    decision: text("decision").$type<ExceptionDecision>().notNull().default("PENDING"),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }),
    currency: text("currency").$type<"CZK" | "EUR">().notNull().default("CZK"),
    description: text("description").notNull().default(""),
    pieces: integer("pieces"),
    waitingMinutes: integer("waiting_minutes"),
    /** A Warehouse OSD exception (warehouse_exception.id, another database) it was raised from */
    warehouseExceptionId: uuid("warehouse_exception_id"),
    createdByUserId: uuid("created_by_user_id"),
    createdBy: text("created_by").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    decisionReason: text("decision_reason"),
    claimTargetKind: text("claim_target_kind").$type<ClaimTargetKind>(),
    claimTargetId: uuid("claim_target_id"),
    claimHaulierCustomerId: uuid("claim_haulier_customer_id"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),
    closeNote: text("close_note"),
    photos: jsonb("photos").$type<{ id: string; fileName: string }[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("trucking_exception", table),
    tenantIndex("trucking_exception", table),
    index("trucking_exception_consignment_idx").on(table.consignmentId),
    index("trucking_exception_open_idx").on(table.companyId, table.consignmentId).where(sql`closed_at IS NULL AND deleted_at IS NULL`),
    index("trucking_exception_claim_idx").on(table.companyId, table.claimTargetId).where(sql`claim_target_id IS NOT NULL`),
    foreignKey({ name: "trucking_exception_consignment_fk", columns: [table.consignmentId], foreignColumns: [truckingConsignmentTable.id] }).onDelete("restrict"),
    foreignKey({ name: "trucking_exception_leg_fk", columns: [table.legId], foreignColumns: [truckingLegTable.id] }).onDelete("restrict"),
    check("trucking_exception_kind_check", sql`${table.kind} IN ('FAILED_DELIVERY', 'DAMAGE', 'SHORTAGE', 'OVERAGE', 'WAITING_TIME', 'REDELIVERY', 'OTHER')`),
    check(
      "trucking_exception_failed_reason_check",
      sql`${table.failedReason} IS NULL OR ${table.failedReason} IN ('CLOSED', 'ABSENT', 'REFUSED', 'WRONG_ADDRESS', 'REFUSED_DAMAGED', 'NO_AVIZACE', 'OTHER')`,
    ),
    check("trucking_exception_cause_check", sql`${table.cause} IN ('CUSTOMER', 'HAULIER', 'US', 'UNKNOWN')`),
    check("trucking_exception_decision_check", sql`${table.decision} IN ('CHARGE_CUSTOMER', 'CLAIM_HAULIER', 'ABSORB', 'PENDING')`),
    check("trucking_exception_currency_check", sql`${table.currency} IN ('CZK', 'EUR')`),
    check("trucking_exception_claim_kind_check", sql`${table.claimTargetKind} IS NULL OR ${table.claimTargetKind} IN ('TRIP', 'PARTNER_LEG')`),
    // Charging or claiming needs an amount above 0; only a decided exception is closed.
    check("trucking_exception_amount_check", sql`${table.decision} NOT IN ('CHARGE_CUSTOMER', 'CLAIM_HAULIER') OR ${table.amount} > 0`),
    check("trucking_exception_closed_check", sql`${table.closedAt} IS NULL OR ${table.decision} <> 'PENDING'`),
  ],
);

export type TruckingExceptionRecord = typeof truckingExceptionTable.$inferSelect;
export type NewTruckingExceptionRecord = typeof truckingExceptionTable.$inferInsert;
