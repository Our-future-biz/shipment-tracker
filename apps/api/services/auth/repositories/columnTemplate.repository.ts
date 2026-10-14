import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { columnTemplateTable, type ColumnTemplateRecord } from "../schemas/columnTemplate.schema";

// Templates are personal: every query matches the company and the user.
class ColumnTemplateRepository extends TenantRepository<typeof columnTemplateTable> {
  constructor() {
    super(db, columnTemplateTable, "column_template");
  }

  async listForUser(companyId: string, userId: string, scope: string): Promise<ColumnTemplateRecord[]> {
    return this.db
      .select()
      .from(columnTemplateTable)
      .where(
        and(
          eq(columnTemplateTable.companyId, companyId),
          eq(columnTemplateTable.userId, userId),
          eq(columnTemplateTable.scope, scope),
          isNull(columnTemplateTable.deletedAt),
        ),
      )
      .orderBy(asc(columnTemplateTable.name));
  }

  // Insert, or overwrite the template with the same (user, scope, name) — also one deleted
  // earlier, which the unique key still holds.
  async upsert(companyId: string, userId: string, scope: string, name: string, columns: string[]): Promise<ColumnTemplateRecord> {
    const [row] = await this.db
      .insert(columnTemplateTable)
      .values({ companyId, userId, scope, name, columns })
      .onConflictDoUpdate({
        target: [columnTemplateTable.userId, columnTemplateTable.scope, columnTemplateTable.name],
        set: { columns, deletedAt: null, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  async softDeleteForUser(companyId: string, userId: string, id: string): Promise<ColumnTemplateRecord | null> {
    const [row] = await this.db
      .update(columnTemplateTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(columnTemplateTable.id, id),
          eq(columnTemplateTable.companyId, companyId),
          eq(columnTemplateTable.userId, userId),
          isNull(columnTemplateTable.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }
}

export const columnTemplateRepository = new ColumnTemplateRepository();
