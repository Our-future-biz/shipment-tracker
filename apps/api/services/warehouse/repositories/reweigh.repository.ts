import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseReweighTable, type NewWarehouseReweighRecord, type WarehouseReweighRecord } from "../schemas/warehouseReweigh.schema";
import type { Tx } from "./warehouseSection.repository";
import { TenantRepository } from "../../../lib/db/repository";

const r = warehouseReweighTable;

class ReweighRepository extends TenantRepository<typeof warehouseReweighTable> {
  constructor() {
    super(db, warehouseReweighTable, "warehouse_reweigh");
  }

  async insert(tx: Tx, row: NewWarehouseReweighRecord) {
    const [created] = await tx.insert(r).values(row).returning();
    return created!;
  }

  // Every re-weighing of these positions, latest first (the first of a position is the one that counts).
  async listForMovements(movementIds: string[], companyId: string, tx: Tx | typeof db = db): Promise<WarehouseReweighRecord[]> {
    if (!movementIds.length) return [];
    return tx
      .select()
      .from(r)
      .where(and(eq(r.companyId, companyId), inArray(r.movementId, movementIds), isNull(r.deletedAt)))
      .orderBy(desc(r.weighedAt), desc(r.createdAt));
  }

  async latestForMovement(movementId: string, companyId: string, tx: Tx | typeof db = db) {
    return (await this.listForMovements([movementId], companyId, tx))[0] ?? null;
  }

  async findByRequestId(movementId: string, companyId: string, requestId: string, tx: Tx | typeof db = db) {
    const [row] = await tx
      .select()
      .from(r)
      .where(and(eq(r.companyId, companyId), eq(r.movementId, movementId), eq(r.clientRequestId, requestId)));
    return row ?? null;
  }
}

export const reweighRepository = new ReweighRepository();
