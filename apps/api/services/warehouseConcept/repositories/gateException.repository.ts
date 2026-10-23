import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { warehouseExceptionTable, type NewWarehouseExceptionRecord, type WarehouseExceptionRecord } from "../schemas/warehouseException.schema";
import { gateMovementTable } from "../schemas/gateMovement.schema";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";
import type { Tx } from "./warehouseSection.repository";

const x = warehouseExceptionTable;

class GateExceptionRepository extends TenantRepository<typeof warehouseExceptionTable> {
  constructor() {
    super(db, warehouseExceptionTable, "warehouse_exception");
  }

  // The company's gate records with an open exception (the managers' cockpit reads them even
  // after the release: the exception is still open there).
  async openMovementIds(companyId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ movementId: x.movementId })
      .from(x)
      .where(and(eq(x.companyId, companyId), eq(x.status, "open"), isNull(x.deletedAt)));
    return rows.map((r) => r.movementId);
  }

  async listForMovements(movementIds: string[], companyId: string): Promise<WarehouseExceptionRecord[]> {
    if (!movementIds.length) return [];
    return this.db
      .select()
      .from(x)
      .where(and(eq(x.companyId, companyId), inArray(x.movementId, movementIds), isNull(x.deletedAt)))
      .orderBy(asc(x.createdAt));
  }

  async openForMovement(tx: Tx, movementId: string, companyId: string) {
    return tx
      .select()
      .from(x)
      .where(and(eq(x.companyId, companyId), eq(x.movementId, movementId), eq(x.status, "open"), isNull(x.deletedAt)))
      .orderBy(asc(x.createdAt));
  }

  // The exception a phone request already made on this movement, if any.
  async findByRequestId(tx: Tx | typeof db, movementId: string, companyId: string, requestId: string) {
    const [row] = await tx
      .select()
      .from(x)
      .where(and(eq(x.companyId, companyId), eq(x.movementId, movementId), eq(x.clientRequestId, requestId)))
      .limit(1);
    return row ?? null;
  }

  async insert(tx: Tx, row: NewWarehouseExceptionRecord) {
    const [created] = await tx.insert(x).values(row).returning();
    return created!;
  }

  // Resolves one open exception; null when it is not open (any more) on that movement.
  async resolve(tx: Tx, id: string, movementId: string, companyId: string, by: string, note: string) {
    const now = new Date();
    const [row] = await tx
      .update(x)
      .set({ status: "resolved", resolvedAt: now, resolvedBy: by, resolutionNote: note, updatedAt: now })
      .where(and(eq(x.id, id), eq(x.movementId, movementId), eq(x.companyId, companyId), eq(x.status, "open"), isNull(x.deletedAt)))
      .returning();
    return row ?? null;
  }

  // Open exceptions of positions taken out of the warehouse are closed (resolved, with the reason).
  async closeForMovements(tx: Tx, movementIds: string[], companyId: string, by: string, note: string): Promise<number> {
    if (!movementIds.length) return 0;
    const now = new Date();
    const rows = await tx
      .update(x)
      .set({ status: "resolved", resolvedAt: now, resolvedBy: by, resolutionNote: note, updatedAt: now })
      .where(and(eq(x.companyId, companyId), inArray(x.movementId, movementIds), eq(x.status, "open"), isNull(x.deletedAt)))
      .returning({ id: x.id });
    return rows.length;
  }

  /**
   * The exceptions of the positions of these shipments (the exception's task, else its
   * movement's), oldest first: what Trucking shows read-only with a consignment.
   */
  async forShipments(companyId: string, shipmentIds: string[]) {
    if (!shipmentIds.length) return [];
    const m = gateMovementTable;
    const task = warehouseTaskTable;
    return this.db
      .select({ id: x.id, shipmentId: task.shipmentId, kind: x.type, pieces: x.pieces, note: x.note, status: x.status, createdAt: x.createdAt })
      .from(x)
      .innerJoin(m, eq(m.id, x.movementId))
      .innerJoin(task, eq(task.id, sql`coalesce(${x.taskId}, ${m.warehouseTaskId})`))
      .where(and(eq(x.companyId, companyId), isNull(x.deletedAt), eq(task.companyId, companyId), inArray(task.shipmentId, shipmentIds)))
      .orderBy(asc(x.createdAt));
  }

  async findById(id: string, movementId: string, companyId: string) {
    const [row] = await db
      .select()
      .from(x)
      .where(and(eq(x.id, id), eq(x.movementId, movementId), eq(x.companyId, companyId), isNull(x.deletedAt)));
    return row ?? null;
  }
}

export const gateExceptionRepository = new GateExceptionRepository();
