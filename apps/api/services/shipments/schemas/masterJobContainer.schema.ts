import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// A container on the master BL. Each one is assigned to the house shipments
// whose cargo travels in it; assigned containers are copied onto those houses'
// own container lists.
export const masterJobContainerTable = pgTable(
  "master_job_container",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    masterJobId: uuid("master_job_id").notNull(),
    position: integer("position").notNull().default(0),
    containerNumber: text("container_number").notNull().default(""),
    sealNumber: text("seal_number").notNull().default(""),
    // Same dictionary as container.type, e.g. "40' HC".
    type: text("type").notNull().default(""),
    shipmentIds: uuid("shipment_ids").array().notNull().default([]),
  },
  (table) => [
    ...defaultTableIndexes("master_job_container", table),
    tenantIndex("master_job_container", table),
    index("master_job_container_master_job_id_idx").on(table.masterJobId),
  ],
);

export type MasterJobContainerRecord = typeof masterJobContainerTable.$inferSelect;
export type NewMasterJobContainerRecord = typeof masterJobContainerTable.$inferInsert;
