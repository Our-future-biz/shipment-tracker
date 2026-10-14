import { pgTable, text, uuid, bigint, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Photos and documents of a gate movement (survey evidence). Metadata lives here;
// the bytes live in the warehouse-gate-files bucket under `storageKey`.
export const gateFileTable = pgTable(
  "warehouse_gate_file",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    movementId: uuid("movement_id").notNull(),
    container: text("container").notNull().default(""),
    tag: text("tag").notNull().default(""), // PC n · CTN · DOC
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    fileType: text("file_type").notNull().default(""),
    storageKey: text("storage_key").notNull(),
    uploadedBy: text("uploaded_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_gate_file", table),
    tenantIndex("warehouse_gate_file", table),
    index("warehouse_gate_file_movement_idx").on(table.movementId),
  ],
);

export type GateFileRecord = typeof gateFileTable.$inferSelect;
