import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ImportInstructionAnswers } from "../interfaces/importInstructions";

// The Import Instructions a customer fills in through a link (Shipments → Warehouse): one row per link.
// Only the hash of the token in the URL is kept. Completed, the answers wait for the one who created the
// link or a manager, who may edit them, and approve or reject; only then do they reach the shipment.

export type ImportInstructionStatus = "open" | "submitted" | "approved" | "rejected" | "cancelled";

export const shipmentImportInstructionTable = pgTable(
  "shipment_import_instruction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").$type<ImportInstructionStatus>().notNull().default("open"),
    // What the form starts with: read when the link was created, so the public page asks no other service.
    prefill: jsonb("prefill").$type<Partial<ImportInstructionAnswers>>().notNull(),
    answers: jsonb("answers").$type<ImportInstructionAnswers>(),
    createdBy: text("created_by").notNull().default(""),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedBy: text("decided_by").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    reason: text("reason").notNull().default(""),
  },
  (table) => [
    check("shipment_import_instruction_status_check", sql`${table.status} IN ('open', 'submitted', 'approved', 'rejected', 'cancelled')`),
    uniqueIndex("shipment_import_instruction_token_idx").on(table.tokenHash),
    index("shipment_import_instruction_shipment_idx").on(table.shipmentId, table.createdAt),
    index("shipment_import_instruction_waiting_idx").on(table.companyId, table.createdByUserId, table.status),
  ],
);

export type ShipmentImportInstructionRecord = typeof shipmentImportInstructionTable.$inferSelect;
