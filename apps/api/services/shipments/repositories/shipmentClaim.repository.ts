import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentClaimTable } from "../schemas/shipmentClaim.schema";

type ClaimFields = Partial<typeof shipmentClaimTable.$inferInsert>;

class ShipmentClaimRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(shipmentClaimTable)
      .where(and(eq(shipmentClaimTable.companyId, companyId), eq(shipmentClaimTable.shipmentId, shipmentId), isNull(shipmentClaimTable.deletedAt)))
      .orderBy(asc(shipmentClaimTable.createdAt));
  }

  async create(data: { companyId: string; shipmentId: string; kind: string } & ClaimFields) {
    const [row] = await db.insert(shipmentClaimTable).values(data).returning();
    return row!;
  }

  async update(id: string, companyId: string, data: ClaimFields) {
    const [row] = await db
      .update(shipmentClaimTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(shipmentClaimTable.id, id), eq(shipmentClaimTable.companyId, companyId), isNull(shipmentClaimTable.deletedAt)))
      .returning();
    return row ?? null;
  }

  async delete(id: string, companyId: string) {
    await db
      .update(shipmentClaimTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipmentClaimTable.id, id), eq(shipmentClaimTable.companyId, companyId), isNull(shipmentClaimTable.deletedAt)));
  }
}

export const shipmentClaimRepository = new ShipmentClaimRepository();
