import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, jsonb, timestamp, index, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { SupplierEmailSettings, DockSettings, SettingsEvent } from "../services/settingsRules";
import { gateMovementTable } from "./gateMovement.schema";
import { warehouseTaskTable } from "./warehouseTask.schema";

// Warehouse settings: one row per company. Who gets the supplier e-mails (VGM, Survey,
// Remeasurement — To / Cc and an on/off switch per type) and the docks with their opening hours
// (used for dock utilisation). Everyone may read them; only a manager changes them. Every change
// is added to `events` (append-only) and bumps `version`, so a stale save is refused.
export const warehouseSettingsTable = pgTable(
  "warehouse_settings",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    supplierEmail: jsonb("supplier_email").$type<SupplierEmailSettings>().notNull(),
    docks: jsonb("docks").$type<DockSettings>().notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    events: jsonb("events").$type<SettingsEvent[]>().notNull().default([]),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_settings", table),
    tenantIndex("warehouse_settings", table),
    uniqueIndex("warehouse_settings_company_unique").on(table.companyId).where(sql`deleted_at IS NULL`),
  ],
);

/** One attachment of a supplier e-mail as it was sent (or left out, with the reason). */
export interface SupplierEmailAttachment {
  fileId: string;
  fileName: string;
  size: number;
  /** attached | linked (too many / too big: a download link in the text) | listed (named only) */
  how: "attached" | "linked" | "listed";
}

// Every attempt to e-mail a VGM / survey / remeasurement to the supplier. The row is written
// "sending" before the provider is called and set to "sent" (in the same transaction that marks
// the section as sent) or "failed" afterwards — so an e-mail that went out is never lost even if
// the app stops in between. The client's request id is unique: a double click sends once.
export const warehouseSupplierEmailTable = pgTable(
  "warehouse_supplier_email",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    taskId: uuid("task_id").notNull(),
    movementId: uuid("movement_id"),
    kind: text("kind").notNull(), // vgm | survey | remeasurement
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull().default([]),
    ccAddresses: jsonb("cc_addresses").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull().default(""),
    attachments: jsonb("attachments").$type<SupplierEmailAttachment[]>().notNull().default([]),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("sending"), // sending | sent | failed
    error: text("error").notNull().default(""),
    providerId: text("provider_id").notNull().default(""),
    requestedBy: text("requested_by").notNull().default(""),
    requestedByName: text("requested_by_name").notNull().default(""),
    clientRequestId: text("client_request_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_supplier_email", table),
    tenantIndex("warehouse_supplier_email", table),
    index("warehouse_supplier_email_task_idx").on(table.companyId, table.taskId, table.createdAt.desc()),
    uniqueIndex("warehouse_supplier_email_request_unique").on(table.companyId, table.clientRequestId),
    foreignKey({ name: "wh_supplier_email_task_fk", columns: [table.taskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_supplier_email_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
  ],
);

export type WarehouseSettingsRecord = typeof warehouseSettingsTable.$inferSelect;
export type WarehouseSupplierEmailRecord = typeof warehouseSupplierEmailTable.$inferSelect;
export type NewWarehouseSupplierEmailRecord = typeof warehouseSupplierEmailTable.$inferInsert;
