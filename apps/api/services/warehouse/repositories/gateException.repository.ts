import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import log from "encore.dev/log";
import { db } from "../db/db";
import { warehouseExceptionTable, type NewWarehouseExceptionRecord, type WarehouseExceptionRecord } from "../schemas/warehouseException.schema";
import type { Tx } from "./warehouseSection.repository";

const x = warehouseExceptionTable;

// Postgres "undefined_table": the table comes with migration 0015, which Encore applies only on
// a restart. Until then the gate keeps working and simply shows no exceptions.
// The same for "undefined_column" (42703): the request id comes with migration 0016.
const missingTable = (err: unknown) => {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01" || code === "42703";
};

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
      log.warn("warehouse: exceptions table or column missing — restart the API so migrations 0015 / 0016 are applied");
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

  // The exception a phone request already made on this movement, if any.
  async findByRequestId(tx: Tx | typeof db, movementId: string, companyId: string, requestId: string) {
    const [row] = await tx
      .select()
      .from(x)
      .where(and(eq(x.companyId, companyId), eq(x.movementId, movementId), eq(x.clientRequestId, requestId)))
      .limit(1);
    return row ?? null;
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
