import { uuid, timestamp, index, type PgColumn } from "drizzle-orm/pg-core";

export const defaultTableColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const defaultTableIndexes = (
  tableName: string,
  table: { createdAt: PgColumn; deletedAt: PgColumn },
) => [
  index(`${tableName}_created_at_idx`).on(table.createdAt),
  index(`${tableName}_deleted_at_idx`).on(table.deletedAt),
];
