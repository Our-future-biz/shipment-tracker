import { eq, desc, isNull, and, like, sql } from "drizzle-orm";
import { TenantRepository, type AnyDb } from "../../../lib/db/repository";
import { db } from "../db/db";
import { warehouseTaskTable, type WarehouseTaskRecord } from "../schemas/warehouseTask.schema";

type Tx = Parameters<Parameters<AnyDb["transaction"]>[0]>[0];

class WarehouseTaskRepository extends TenantRepository<typeof warehouseTaskTable> {
  constructor() {
    super(db, warehouseTaskTable, "warehouse_task");
  }

  async listAll(companyId: string): Promise<WarehouseTaskRecord[]> {
    return this.db
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), isNull(warehouseTaskTable.deletedAt)))
      .orderBy(desc(warehouseTaskTable.createdAt));
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<WarehouseTaskRecord[]> {
    return this.db
      .select()
      .from(warehouseTaskTable)
      .where(and(
        eq(warehouseTaskTable.companyId, companyId),
        eq(warehouseTaskTable.shipmentId, shipmentId),
        isNull(warehouseTaskTable.deletedAt),
      ));
  }

  /**
   * The warehouse reference of a shipment, creating it on first use: WHCZ + year + a
   * per-company sequence of that year (WHCZ2026001). An advisory lock keeps two parallel
   * calls from handing out the same number; deleted rows still hold their number, so one
   * is never reused.
   */
  async findForShipment(companyId: string, shipmentId: string): Promise<WarehouseTaskRecord | null> {
    const [row] = await this.db
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async ensureForShipment(companyId: string, shipmentId: string, prefix: string): Promise<WarehouseTaskRecord> {
    const existing = await this.db
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)))
      .limit(1);
    if (existing[0]) return existing[0];

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`warehouse-ref:${companyId}`}))`);

      const again = await tx
        .select()
        .from(warehouseTaskTable)
        .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)))
        .limit(1);
      if (again[0]) return again[0];

      const taskId = await this.nextRef(tx, companyId, prefix);
      const [row] = await tx.insert(warehouseTaskTable).values({ companyId, shipmentId, taskId }).returning();
      return row!;
    });
  }

  /**
   * A new truck leaving the warehouse: a row of its own holding the next reference of the
   * `prefix` sequence (TCZ2026001), numbered the same way as the shipments' references.
   */
  async createTruck(companyId: string, prefix: string): Promise<WarehouseTaskRecord> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`warehouse-ref:${companyId}`}))`);
      const taskId = await this.nextRef(tx, companyId, prefix);
      const [row] = await tx.insert(warehouseTaskTable).values({ companyId, taskId, type: "Truck" }).returning();
      return row!;
    });
  }

  /** The next free reference of a prefix; call it holding the company's reference lock. */
  private async nextRef(tx: Tx, companyId: string, prefix: string): Promise<string> {
    const used = await tx
      .select({ taskId: warehouseTaskTable.taskId })
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), like(warehouseTaskTable.taskId, `${prefix}%`)));
    const highest = used.reduce((max, r) => Math.max(max, parseInt(r.taskId.slice(prefix.length), 10) || 0), 0);
    return `${prefix}${String(highest + 1).padStart(3, "0")}`;
  }

  // A deleted shipment's warehouse rows go with it; their references stay taken (nextRef counts them).
  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(warehouseTaskTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)));
  }
}

export const warehouseTaskRepository = new WarehouseTaskRepository();
