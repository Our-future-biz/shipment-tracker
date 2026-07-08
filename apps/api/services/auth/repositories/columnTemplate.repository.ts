import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { columnTemplateTable } from "../schemas/columnTemplate.schema";

class ColumnTemplateRepository {
  async listByUser(userId: string) {
    return db
      .select()
      .from(columnTemplateTable)
      .where(and(eq(columnTemplateTable.userId, userId), isNull(columnTemplateTable.deletedAt)))
      .orderBy(asc(columnTemplateTable.name));
  }

  // Insert, or overwrite the existing template with the same (userId, name).
  async upsert(userId: string, name: string, columns: string[]) {
    const [existing] = await db
      .select()
      .from(columnTemplateTable)
      .where(
        and(
          eq(columnTemplateTable.userId, userId),
          eq(columnTemplateTable.name, name),
          isNull(columnTemplateTable.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(columnTemplateTable)
        .set({ columns, updatedAt: new Date() })
        .where(eq(columnTemplateTable.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await db.insert(columnTemplateTable).values({ userId, name, columns }).returning();
    return row!;
  }

  async deleteForUser(userId: string, id: string) {
    await db
      .delete(columnTemplateTable)
      .where(and(eq(columnTemplateTable.id, id), eq(columnTemplateTable.userId, userId)));
  }
}

export const columnTemplateRepository = new ColumnTemplateRepository();
