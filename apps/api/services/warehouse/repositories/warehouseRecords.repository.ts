import { and, asc, eq, gt, inArray, isNull, like, lt, ne, notInArray, sql } from "drizzle-orm";
import log from "encore.dev/log";
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

const ds = warehouseDockSlotTable;
// Postgres "undefined_table" / "undefined_column": the slot link comes with migration 0016, which
// Encore applies only on a restart. Until then the Gate Log keeps working without dock slots.
const missingSchema = (err: unknown) => {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01" || code === "42703";
};

class WarehouseDockSlotRepository extends TenantRepository<typeof warehouseDockSlotTable> {
  constructor() {
    super(db as never, warehouseDockSlotTable, "warehouse_dock_slot");
  }

  // Live slots of these movements (every status), earliest first.
  async listForMovements(movementIds: string[], companyId: string) {
    if (!movementIds.length) return [];
    try {
      return await this.db
        .select()
        .from(ds)
        .where(and(eq(ds.companyId, companyId), inArray(ds.movementId, movementIds), isNull(ds.deletedAt)))
        .orderBy(asc(ds.startsAt), asc(ds.createdAt));
    } catch (err) {
      if (!missingSchema(err)) throw err;
      log.warn("warehouse: dock slot link missing — restart the API so migration 0016 is applied");
      return [];
    }
  }

  // A live slot of the company that holds `dock` at some time in [startsAt, endsAt), other
  // than `exceptId`; null when the door is free. The EXCLUDE constraint is the guarantee — this
  // only names the clash in the message.
  async findOverlap(companyId: string, dock: string, startsAt: Date, endsAt: Date, exceptId?: string) {
    const [row] = await this.db
      .select()
      .from(ds)
      .where(
        and(
          eq(ds.companyId, companyId),
          eq(ds.dock, dock),
          isNull(ds.deletedAt),
          notInArray(ds.status, ["Cancelled", "Completed"]),
          lt(ds.startsAt, endsAt),
          gt(ds.endsAt, startsAt),
          exceptId ? ne(ds.id, exceptId) : undefined,
        ),
      )
      .orderBy(asc(ds.startsAt))
      .limit(1);
    return row ?? null;
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

  // Creates a claim under the next number for the prefix (CL-YY- + 0001, 0002, …). Numbers
  // are counted over deleted claims too, so one is never reused; the per-company advisory
  // lock stops two claims created at once taking the same number (as for WCZ references).
  async createNumbered(companyId: string, prefix: string, values: Omit<typeof warehouseClaimTable.$inferInsert, "companyId" | "ref">) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_claim:${companyId}`}))`);
      const rows = await tx
        .select({ ref: warehouseClaimTable.ref })
        .from(warehouseClaimTable)
        .where(and(eq(warehouseClaimTable.companyId, companyId), like(warehouseClaimTable.ref, `${prefix}%`)));
      const max = rows.reduce((m, r) => Math.max(m, parseInt(r.ref.slice(prefix.length), 10) || 0), 0);
      const ref = `${prefix}${String(max + 1).padStart(4, "0")}`;
      const [row] = await tx.insert(warehouseClaimTable).values({ ...values, companyId, ref }).returning();
      return row!;
    });
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
