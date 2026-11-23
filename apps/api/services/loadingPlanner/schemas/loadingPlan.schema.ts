import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { PlanCargoLine, PlanLinkKind } from "../interfaces/interfaces";

// A saved loading plan: the cargo list and the nominated equipment. The loads are not stored; the
// planner works them out from these whenever the plan is opened.
export const loadingPlanTable = pgTable(
  "loading_plan",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    name: text("name").notNull(),
    linkKind: text("link_kind").$type<PlanLinkKind>(),
    // Id of a shipment or a quote; they live in other databases, so there is no foreign key.
    linkId: uuid("link_id"),
    linkRef: text("link_ref").notNull().default(""),
    lines: jsonb("lines").$type<PlanCargoLine[]>().notNull().default([]),
    nominated: jsonb("nominated").$type<string[]>(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("loading_plan", table),
    tenantIndex("loading_plan", table),
    index("loading_plan_link_idx").on(table.companyId, table.linkKind, table.linkId),
    check("loading_plan_link_kind_check", sql`${table.linkKind} IN ('shipment', 'quote')`),
    check("loading_plan_link_whole_check", sql`(${table.linkKind} IS NULL) = (${table.linkId} IS NULL)`),
  ],
);

export type LoadingPlanRecord = typeof loadingPlanTable.$inferSelect;
export type NewLoadingPlanRecord = typeof loadingPlanTable.$inferInsert;
