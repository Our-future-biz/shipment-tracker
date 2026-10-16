import { pgTable, uuid, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

// The last warehouse reference number handed out per company and Prague calendar year
// (WCZ + year + six digits, e.g. WCZ2026000001). One row is bumped atomically per new
// position, so references are never taken from the existing ones (old day-based references
// such as WCZ2026101410 stay as they are and never move this counter).
export const warehouseRefCounterTable = pgTable(
  "warehouse_ref_counter",
  {
    companyId: uuid("company_id").notNull(),
    year: integer("year").notNull(),
    last: integer("last").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.year] })],
);

export type WarehouseRefCounterRecord = typeof warehouseRefCounterTable.$inferSelect;
