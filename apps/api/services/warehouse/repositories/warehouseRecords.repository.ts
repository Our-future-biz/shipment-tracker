import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  warehouseClaimTable,
  warehouseContainerTable,
  warehouseDockSlotTable,
  warehouseEquipmentTable,
  warehouseSavedReportTable,
  warehouseStaffTable,
} from "../schemas/warehouseRecords.schema";

class WarehouseContainerRepository extends TenantRepository<typeof warehouseContainerTable> {
  constructor() {
    super(db as never, warehouseContainerTable, "warehouse_container");
  }

  async listForMovements(movementIds: string[], companyId: string) {
    if (!movementIds.length) return [];
    return this.db
      .select()
      .from(warehouseContainerTable)
      .where(
        and(
          eq(warehouseContainerTable.companyId, companyId),
          inArray(warehouseContainerTable.movementId, movementIds),
          isNull(warehouseContainerTable.deletedAt),
        ),
      )
      .orderBy(warehouseContainerTable.createdAt);
  }
}

class WarehouseDockSlotRepository extends TenantRepository<typeof warehouseDockSlotTable> {
  constructor() {
    super(db as never, warehouseDockSlotTable, "warehouse_dock_slot");
  }
}

class WarehouseStaffRepository extends TenantRepository<typeof warehouseStaffTable> {
  constructor() {
    super(db as never, warehouseStaffTable, "warehouse_staff");
  }
}

class WarehouseEquipmentRepository extends TenantRepository<typeof warehouseEquipmentTable> {
  constructor() {
    super(db as never, warehouseEquipmentTable, "warehouse_equipment");
  }
}

class WarehouseClaimRepository extends TenantRepository<typeof warehouseClaimTable> {
  constructor() {
    super(db as never, warehouseClaimTable, "warehouse_claim");
  }

  // All refs with the given prefix, deleted ones included, so a number is never reused.
  async refsWithPrefix(prefix: string, companyId: string) {
    const rows = await this.db
      .select({ ref: warehouseClaimTable.ref })
      .from(warehouseClaimTable)
      .where(and(eq(warehouseClaimTable.companyId, companyId), like(warehouseClaimTable.ref, `${prefix}%`)));
    return rows.map((r) => r.ref);
  }
}

class WarehouseSavedReportRepository extends TenantRepository<typeof warehouseSavedReportTable> {
  constructor() {
    super(db as never, warehouseSavedReportTable, "warehouse_saved_report");
  }
}

export const containerRepository = new WarehouseContainerRepository();
export const dockSlotRepository = new WarehouseDockSlotRepository();
export const staffRepository = new WarehouseStaffRepository();
export const equipmentRepository = new WarehouseEquipmentRepository();
export const claimRepository = new WarehouseClaimRepository();
export const savedReportRepository = new WarehouseSavedReportRepository();
