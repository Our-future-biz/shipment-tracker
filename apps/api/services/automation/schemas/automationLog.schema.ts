import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const automationLogTable = pgTable(
  "automation_log",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    ruleName: text("rule_name").notNull(),
    action: text("action").notNull(),
    details: jsonb("details").notNull().default({}),
    triggeredById: uuid("triggered_by_id"),
  },
  (table) => [
    ...defaultTableIndexes("automation_log", table),
    tenantIndex("automation_log", table),
    index("automation_log_shipment_id_idx").on(table.shipmentId),
  ],
);

export type AutomationLogRecord = typeof automationLogTable.$inferSelect;
export type NewAutomationLogRecord = typeof automationLogTable.$inferInsert;
