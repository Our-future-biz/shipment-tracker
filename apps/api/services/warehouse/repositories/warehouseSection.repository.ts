import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseSectionTable } from "../schemas/warehouseSection.schema";

class WarehouseSectionRepository {
  async findByShipmentAndSection(shipmentId: string, section: string) {
    const [row] = await db
      .select()
      .from(warehouseSectionTable)
      .where(
        and(
          eq(warehouseSectionTable.shipmentId, shipmentId),
          eq(warehouseSectionTable.section, section),
          isNull(warehouseSectionTable.deletedAt),
        ),
      );
    return row ?? null;
  }

  async upsert(shipmentId: string, section: string, data: unknown) {
    const existing = await this.findByShipmentAndSection(shipmentId, section);
    if (existing) {
      const [row] = await db
        .update(warehouseSectionTable)
        .set({ data, updatedAt: new Date() } as never)
        .where(eq(warehouseSectionTable.id, existing.id))
        .returning();
      return row!;
    }
    const [row] = await db
      .insert(warehouseSectionTable)
      .values({ shipmentId, section, data })
      .returning();
    return row!;
  }
}

export const warehouseSectionRepository = new WarehouseSectionRepository();
