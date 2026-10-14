import { and, eq, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { warehouseSectionTable, type WarehouseSectionRecord } from "../schemas/warehouseSection.schema";

class WarehouseSectionRepository extends TenantRepository<typeof warehouseSectionTable> {
  constructor() {
    super(db, warehouseSectionTable, "warehouse_section");
  }

  async findByShipmentAndSection(shipmentId: string, section: string, companyId: string): Promise<WarehouseSectionRecord | null> {
    const [row] = await this.db
      .select()
      .from(warehouseSectionTable)
      .where(
        and(
          eq(warehouseSectionTable.companyId, companyId),
          eq(warehouseSectionTable.shipmentId, shipmentId),
          eq(warehouseSectionTable.section, section),
          isNull(warehouseSectionTable.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // One statement, so two saves at once can't both insert the same live section.
  async upsert(shipmentId: string, section: string, companyId: string, data: unknown): Promise<WarehouseSectionRecord> {
    const [row] = await this.db
      .insert(warehouseSectionTable)
      .values({ companyId, shipmentId, section, data })
      .onConflictDoUpdate({
        target: [warehouseSectionTable.companyId, warehouseSectionTable.shipmentId, warehouseSectionTable.section],
        targetWhere: sql`deleted_at IS NULL`,
        set: { data, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(warehouseSectionTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(warehouseSectionTable.companyId, companyId),
          eq(warehouseSectionTable.shipmentId, shipmentId),
          isNull(warehouseSectionTable.deletedAt),
        ),
      );
  }
}

export const warehouseSectionRepository = new WarehouseSectionRepository();
