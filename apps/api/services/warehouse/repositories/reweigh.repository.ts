import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import log from "encore.dev/log";
import { db } from "../db/db";
import { warehouseReweighTable, type NewWarehouseReweighRecord, type WarehouseReweighRecord } from "../schemas/warehouseReweigh.schema";
import type { Tx } from "./warehouseSection.repository";

const r = warehouseReweighTable;

// Postgres "undefined_table": the table comes with migration 0017, which Encore applies only on a
// restart. Until then the gate keeps working and shows no re-weighing.
const missingTable = (err: unknown) => {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01" || code === "42703";
};

class ReweighRepository {
  async create(tx: Tx, row: NewWarehouseReweighRecord) {
    const [created] = await tx.insert(r).values(row).returning();
    return created!;
  }

  // Every re-weighing of these positions, latest first (the first of a position is the one that counts).
  async listForMovements(movementIds: string[], companyId: string, tx: Tx | typeof db = db): Promise<WarehouseReweighRecord[]> {
    if (!movementIds.length) return [];
    try {
      return await tx
        .select()
        .from(r)
        .where(and(eq(r.companyId, companyId), inArray(r.movementId, movementIds), isNull(r.deletedAt)))
        .orderBy(desc(r.weighedAt), desc(r.createdAt));
    } catch (err) {
      if (!missingTable(err)) throw err;
      log.warn("warehouse: re-weigh table missing — restart the API so migration 0017 is applied");
      return [];
    }
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
