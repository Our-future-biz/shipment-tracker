import { date, pgTable, text, uuid, integer, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

export const containerTable = pgTable(
  "container",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    containerNumber: text("container_number").notNull().default(""),
    sealNumber: text("seal_number").notNull().default(""),
    type: text("type").notNull().default(""),
    teu: text("teu").notNull().default(""),
    packages: text("packages").notNull().default(""),
    packageType: text("package_type").notNull().default(""),
    grossWeight: text("gross_weight").notNull().default(""),
    volume: text("volume").notNull().default(""),
    // Free time at the carrier (lib/detentionClock). Never touched by a sync of the container rows.
    freeTimeDays: integer("free_time_days"),
    freeTimeFrom: text("free_time_from").notNull().default("discharge"),
    lastFreeDay: date("last_free_day", { mode: "string" }),
  },
  (table) => [
    ...defaultTableIndexes("container", table),
    tenantIndex("container", table),
    index("container_shipment_id_idx").on(table.shipmentId),
    // A source reports by container number: finding the job by it.
    index("container_company_number_idx").on(table.companyId, table.containerNumber),
  ],
);

export type ContainerRecord = typeof containerTable.$inferSelect;
export type NewContainerRecord = typeof containerTable.$inferInsert;
