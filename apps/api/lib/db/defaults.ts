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

// Tenant-scoped tables spread this so every row is owned by exactly one company.
// company_id is a bare uuid (no cross-database FK) pointing at auth.company.id;
// integrity is enforced in the application layer (TenantRepository) and at login.
export const tenantColumns = {
  companyId: uuid("company_id").notNull(),
};

export const defaultTableIndexes = (
  tableName: string,
  table: { createdAt: PgColumn; deletedAt: PgColumn },
) => [
  index(`${tableName}_created_at_idx`).on(table.createdAt),
  index(`${tableName}_deleted_at_idx`).on(table.deletedAt),
];

// Every tenant table indexes company_id first — it leads every tenant-scoped query.
export const tenantIndex = (
  tableName: string,
  table: { companyId: PgColumn },
) => index(`${tableName}_company_id_idx`).on(table.companyId);
