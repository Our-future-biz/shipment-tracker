import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// A company's Co-Loading Concept settings: one row per company, written when a manager first
// changes them. A company without a row plans with the starting figure (lib/coLoadingSettings).
export const coLoadingSettingTable = pgTable(
  "co_loading_setting",
  {
    // Bare uuid of auth.company.id; there is no cross-database foreign key.
    companyId: uuid("company_id").primaryKey(),
    // The share of a box's inside volume planned with, in whole percent (Council Outlay 12, D2 and D3).
    planningVolumePct: integer("planning_volume_pct").notNull(),
    // The steps of a sailing's checklist, for an import and for an export service (Council Outlay 14,
    // C5, D12); null while the company uses the starting list (lib/coLoadingLog).
    checklistImport: jsonb("checklist_import").$type<string[]>(),
    checklistExport: jsonb("checklist_export").$type<string[]>(),
    updatedById: uuid("updated_by_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("co_loading_setting_planning_pct_check", sql`${table.planningVolumePct} BETWEEN 50 AND 100`)],
);

export type CoLoadingSettingRecord = typeof coLoadingSettingTable.$inferSelect;
