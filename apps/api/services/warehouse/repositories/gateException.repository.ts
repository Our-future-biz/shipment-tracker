import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import log from "encore.dev/log";
import { db } from "../db/db";
import { warehouseExceptionTable, type NewWarehouseExceptionRecord, type WarehouseExceptionRecord } from "../schemas/warehouseException.schema";
import type { Tx } from "./warehouseSection.repository";

const x = warehouseExceptionTable;

// Postgres "undefined_table": the table comes with migration 0015, which Encore applies only on
// a restart. Until then the gate keeps working and simply shows no exceptions.
const missingTable = (err: unknown) => (err as { code?: string })?.code === "42P01" || (err as { cause?: { code?: string } })?.cause?.code === "42P01";

class GateExceptionRepository {
  async listForMovements(movementIds: string[], companyId: string): Promise<WarehouseExceptionRecord[]> {
    if (!movementIds.length) return [];
    try {
      return await db
        .select()
        .from(x)
        .where(and(eq(x.companyId, companyId), inArray(x.movementId, movementIds), isNull(x.deletedAt)))
        .orderBy(asc(x.createdAt));
    } catch (err) {
      if (!missingTable(err)) throw err;
      log.warn("warehouse: exceptions table missing — restart the API so migration 0015 is applied");
      return [];
    }
  }

  async openForMovement(tx: Tx, movementId: string, companyId: string) {
    return tx
      .select()
      .from(x)
      .where(and(eq(x.companyId, companyId), eq(x.movementId, movementId), eq(x.status, "open"), isNull(x.deletedAt)))
      .orderBy(asc(x.createdAt));
  }

  async create(tx: Tx, row: NewWarehouseExceptionRecord) {
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

  async findById(id: string, movementId: string, companyId: string) {
    const [row] = await db
      .select()
      .from(x)
      .where(and(eq(x.id, id), eq(x.movementId, movementId), eq(x.companyId, companyId), isNull(x.deletedAt)));
    return row ?? null;
  }
}

export const gateExceptionRepository = new GateExceptionRepository();
