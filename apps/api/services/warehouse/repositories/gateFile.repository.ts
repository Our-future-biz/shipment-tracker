import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { gateFileTable } from "../schemas/gateFile.schema";

class GateFileRepository {
  async listForMovement(movementId: string, companyId: string) {
    return db
      .select()
      .from(gateFileTable)
      .where(and(eq(gateFileTable.movementId, movementId), eq(gateFileTable.companyId, companyId), isNull(gateFileTable.deletedAt)))
      .orderBy(asc(gateFileTable.createdAt));
  }

  async findById(id: string, movementId: string, companyId: string) {
    const [row] = await db
      .select()
      .from(gateFileTable)
      .where(
        and(
          eq(gateFileTable.id, id),
          eq(gateFileTable.movementId, movementId),
          eq(gateFileTable.companyId, companyId),
          isNull(gateFileTable.deletedAt),
        ),
      );
    return row ?? null;
  }

  // The file a phone request already uploaded to this movement (archived or not), if any.
  async findByRequestId(movementId: string, companyId: string, requestId: string) {
    const [row] = await db
      .select()
      .from(gateFileTable)
      .where(and(eq(gateFileTable.movementId, movementId), eq(gateFileTable.companyId, companyId), eq(gateFileTable.clientRequestId, requestId)))
      .limit(1);
    return row ?? null;
  }

  async create(data: typeof gateFileTable.$inferInsert) {
    const [row] = await db.insert(gateFileTable).values(data).returning();
    return row!;
  }

  async softDelete(id: string, movementId: string, companyId: string) {
    const [row] = await db
      .update(gateFileTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(gateFileTable.id, id),
          eq(gateFileTable.movementId, movementId),
          eq(gateFileTable.companyId, companyId),
          isNull(gateFileTable.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }
}

export const gateFileRepository = new GateFileRepository();
