import { and, eq, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import { shipmentTaskTable, type ShipmentTaskRecord } from "../schemas/shipmentTask.schema";

class ShipmentTaskRepository extends TenantRepository<typeof shipmentTaskTable> {
  constructor() {
    super(db, shipmentTaskTable, "shipment_task");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<ShipmentTaskRecord[]> {
    return this.db
      .select()
      .from(shipmentTaskTable)
      .where(
        and(
          eq(shipmentTaskTable.companyId, companyId),
          eq(shipmentTaskTable.shipmentId, shipmentId),
          isNull(shipmentTaskTable.deletedAt),
        ),
      );
  }

  // One statement, so two clicks at once can't create the task twice. A completed task
  // stays completed: the update only applies while it is still open. Only a manager takes one back (reopen).
  async upsert(
    shipmentId: string,
    companyId: string,
    taskKey: string,
    completed: boolean,
    completedById?: string,
    tx?: Tx,
  ): Promise<ShipmentTaskRecord> {
    const database = tx ?? this.db;
    const now = new Date();
    const values = {
      completed,
      completedAt: completed ? now : null,
      completedById: completedById ?? null,
    };
    const [row] = await database
      .insert(shipmentTaskTable)
      .values({ companyId, shipmentId, taskKey, ...values })
      .onConflictDoUpdate({
        target: [shipmentTaskTable.companyId, shipmentTaskTable.shipmentId, shipmentTaskTable.taskKey],
        targetWhere: sql`deleted_at IS NULL`,
        set: { ...values, updatedAt: now },
        setWhere: eq(shipmentTaskTable.completed, false),
      })
      .returning();
    if (row) return row;
    // Already completed: the conflict update was skipped, so return the row as it is.
    const [existing] = await database
      .select()
      .from(shipmentTaskTable)
      .where(
        and(
          eq(shipmentTaskTable.companyId, companyId),
          eq(shipmentTaskTable.shipmentId, shipmentId),
          eq(shipmentTaskTable.taskKey, taskKey),
          isNull(shipmentTaskTable.deletedAt),
        ),
      )
      .limit(1);
    return existing!;
  }

  /** Takes a tick back: a manager correcting a mistake, the reason in the audit log. Null when it isn't ticked. */
  async reopen(shipmentId: string, companyId: string, taskKey: string): Promise<ShipmentTaskRecord | null> {
    const [row] = await this.db
      .update(shipmentTaskTable)
      .set({ completed: false, completedAt: null, completedById: null, updatedAt: new Date() })
      .where(
        and(
          eq(shipmentTaskTable.companyId, companyId),
          eq(shipmentTaskTable.shipmentId, shipmentId),
          eq(shipmentTaskTable.taskKey, taskKey),
          eq(shipmentTaskTable.completed, true),
          isNull(shipmentTaskTable.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }
}

export const shipmentTaskRepository = new ShipmentTaskRepository();
