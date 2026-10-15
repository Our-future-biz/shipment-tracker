import { sql } from "drizzle-orm";
import { pgTable, text, integer, numeric, boolean, uuid, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { InternalChargeKind } from "../interfaces/internal.interfaces";
import { truckingConsignmentTable } from "./truckingConsignment.schema";

// Internal billing (Phase 6): what Trucking charges another department for a consignment on that
// department's job, month by month (the month of the delivery, Prague).
//
// trucking_internal_charge is a ledger, append-only (a trigger refuses UPDATE and DELETE): a
// correction is a new ADJUSTMENT row, which `reverses_id` ties to the row it reverses. A row is
// never written into a CLOSED month (a trigger refuses it); a correction after the close goes
// into the current month. `not_priced` = no Internal tariff priced it (amount 0): the month cannot
// be closed until a later row reverses it.
export const truckingInternalChargeTable = pgTable(
  "trucking_internal_charge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** "YYYY-MM" */
    month: text("month").notNull(),
    consignmentId: uuid("consignment_id").notNull(),
    consignmentRef: text("consignment_ref").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    jobNumber: text("job_number").notNull().default(""),
    department: text("department").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull(),
    serviceLevel: text("service_level"),
    chargeableKg: numeric("chargeable_kg", { precision: 12, scale: 2, mode: "number" }),
    tariffVersionId: uuid("tariff_version_id"),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").$type<"CZK">().notNull().default("CZK"),
    kind: text("kind").$type<InternalChargeKind>().notNull(),
    description: text("description").notNull().default(""),
    notPriced: boolean("not_priced").notNull().default(false),
    /** EXCEPTION rows: the delivery exception charged */
    exceptionId: uuid("exception_id"),
    /** ADJUSTMENT rows: the row reversed */
    reversesId: uuid("reverses_id"),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [
    tenantIndex("trucking_internal_charge", table),
    index("trucking_internal_charge_month_idx").on(table.companyId, table.month, table.department),
    index("trucking_internal_charge_consignment_idx").on(table.companyId, table.consignmentId),
    // A row is reversed at most once.
    uniqueIndex("trucking_internal_charge_reverses_unique").on(table.reversesId).where(sql`reverses_id IS NOT NULL`),
    foreignKey({ name: "trucking_internal_charge_consignment_fk", columns: [table.consignmentId], foreignColumns: [truckingConsignmentTable.id] }).onDelete("restrict"),
    foreignKey({ name: "trucking_internal_charge_reverses_fk", columns: [table.reversesId], foreignColumns: [table.id] }).onDelete("restrict"),
    check("trucking_internal_charge_month_check", sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("trucking_internal_charge_kind_check", sql`${table.kind} IN ('CHARGE', 'EXCEPTION', 'ADJUSTMENT')`),
    check("trucking_internal_charge_currency_check", sql`${table.currency} = 'CZK'`),
    check("trucking_internal_charge_not_priced_check", sql`NOT ${table.notPriced} OR ${table.amount} = 0`),
  ],
);

// A closed month (a row exists only once a manager closed it; no row = OPEN). Never reopened.
export const truckingInternalMonthTable = pgTable(
  "trucking_internal_month",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    month: text("month").notNull(),
    status: text("status").$type<"CLOSED">().notNull().default("CLOSED"),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
    closedBy: text("closed_by").notNull().default(""),
    closedByUserId: uuid("closed_by_user_id"),
  },
  (table) => [
    tenantIndex("trucking_internal_month", table),
    uniqueIndex("trucking_internal_month_unique").on(table.companyId, table.month),
    check("trucking_internal_month_month_check", sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("trucking_internal_month_status_check", sql`${table.status} = 'CLOSED'`),
  ],
);

// One internal statement per receiving department of a closed month: ICZ + year + 4 digits, no
// VAT, never in customer aging. Written with the month's close, never changed.
export const truckingInternalStatementTable = pgTable(
  "trucking_internal_statement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    number: text("number").notNull(),
    month: text("month").notNull(),
    department: text("department").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedBy: text("issued_by").notNull().default(""),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    lineCount: integer("line_count").notNull(),
  },
  (table) => [
    tenantIndex("trucking_internal_statement", table),
    uniqueIndex("trucking_internal_statement_number_unique").on(table.companyId, table.number),
    uniqueIndex("trucking_internal_statement_month_unique").on(table.companyId, table.month, table.department),
    check("trucking_internal_statement_number_check", sql`${table.number} ~ '^ICZ[0-9]{8}$'`),
  ],
);

export type TruckingInternalChargeRecord = typeof truckingInternalChargeTable.$inferSelect;
export type NewTruckingInternalChargeRecord = typeof truckingInternalChargeTable.$inferInsert;
export type TruckingInternalMonthRecord = typeof truckingInternalMonthTable.$inferSelect;
export type TruckingInternalStatementRecord = typeof truckingInternalStatementTable.$inferSelect;
export type NewTruckingInternalStatementRecord = typeof truckingInternalStatementTable.$inferInsert;
