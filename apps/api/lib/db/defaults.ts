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

// The default index of a table that is not a tenant table: its creation time. A tenant table gets
// none here - its tenantIndex (company_id, created_at) serves both - and no table indexes
// deleted_at alone: nearly every row has none, and every query also filters on something better.
export const defaultTableIndexes = (
  tableName: string,
  table: { createdAt: PgColumn; deletedAt: PgColumn },
) => ("companyId" in table ? [] : [index(`${tableName}_created_at_idx`).on(table.createdAt)]);

// Every tenant table indexes company_id first — it leads every tenant-scoped query — followed by
// created_at, the order lists are read in (newest first is the same index read backwards). A
// table without created_at indexes company_id alone.
export const tenantIndex = (
  tableName: string,
  table: { companyId: PgColumn; createdAt?: PgColumn },
) =>
  table.createdAt
    ? index(`${tableName}_company_id_idx`).on(table.companyId, table.createdAt)
    : index(`${tableName}_company_id_idx`).on(table.companyId);
