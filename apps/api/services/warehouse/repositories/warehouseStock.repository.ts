import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  warehouseBondedEntryTable,
  warehouseStockLineTable,
  warehouseStockMovementTable,
  warehouseZoneTable,
} from "../schemas/warehouseStock.schema";
import { gateMovementTable, type GateMovementRecord } from "../schemas/gateMovement.schema";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";
import { warehouseContainerTable } from "../schemas/warehouseRecords.schema";
import type { Tx } from "./warehouseSection.repository";

export type StockLineRecord = typeof warehouseStockLineTable.$inferSelect;
export type NewStockLineRecord = typeof warehouseStockLineTable.$inferInsert;
export type BondedEntryRecord = typeof warehouseBondedEntryTable.$inferSelect;
export type NewBondedEntryRecord = typeof warehouseBondedEntryTable.$inferInsert;
export type NewStockMovementRecord = typeof warehouseStockMovementTable.$inferInsert;

/** The position a stock line / bonded entry is linked to, read with it. */
export interface PositionLink {
  positionRef: string | null;
  gateRef: string | null;
  jobNumber: string | null;
  /** The gate record is archived (or gone). */
  positionArchived: boolean;
}

const sl = warehouseStockLineTable;
const be = warehouseBondedEntryTable;
const gm = gateMovementTable;
const task = warehouseTaskTable;

class StockLineRepository extends TenantRepository<typeof warehouseStockLineTable> {
  constructor() {
    super(db as never, warehouseStockLineTable, "warehouse_stock_line");
  }

  /** Live lines with the WCZ ref of their position (archived positions keep their ref). */
  async listWithPosition(companyId: string, limit = 5000): Promise<(StockLineRecord & PositionLink)[]> {
    const rows = await db
      .select({ line: sl, positionRef: task.taskId, gateRef: gm.gateRef, jobNumber: gm.jobNumber, movementDeletedAt: gm.deletedAt, movementId: gm.id })
      .from(sl)
      .leftJoin(gm, and(eq(gm.id, sl.movementId), eq(gm.companyId, sl.companyId)))
      .leftJoin(task, eq(task.id, gm.warehouseTaskId))
      .where(and(eq(sl.companyId, companyId), isNull(sl.deletedAt)))
      .orderBy(desc(sl.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r.line,
      positionRef: r.positionRef,
      gateRef: r.gateRef,
      jobNumber: r.jobNumber,
      positionArchived: !!r.line.movementId && (!r.movementId || !!r.movementDeletedAt),
    }));
  }

  /** The automatic line of a gate record, locked until the transaction ends (unless `lock` is false: the dry run). */
  async autoForMovement(tx: Tx, companyId: string, movementId: string, lock = true): Promise<StockLineRecord | null> {
    const q = tx
      .select()
      .from(sl)
      .where(and(eq(sl.companyId, companyId), eq(sl.movementId, movementId), eq(sl.source, "auto"), isNull(sl.deletedAt)));
    const [row] = lock ? await q.for("update") : await q;
    return row ?? null;
  }

  /** Whether an open manual line is linked to the gate record (so the sync does not count it twice). */
  async manualOpenForMovement(tx: Tx | typeof db, companyId: string, movementId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: sl.id })
      .from(sl)
      .where(
        and(
          eq(sl.companyId, companyId),
          eq(sl.movementId, movementId),
          eq(sl.source, "manual"),
          isNull(sl.deletedAt),
          isNull(sl.closedAt),
          sql`${sl.status} NOT IN ('Picked', 'Voided')`,
        ),
      )
      .limit(1);
    return !!row;
  }

  /** Inserts the automatic line; null when one already exists (a parallel sync was first). */
  async insertAuto(tx: Tx, data: NewStockLineRecord): Promise<StockLineRecord | null> {
    const [row] = await tx.insert(sl).values(data).onConflictDoNothing().returning();
    return row ?? null;
  }

  async updateTx(tx: Tx, id: string, companyId: string, data: Partial<NewStockLineRecord>): Promise<StockLineRecord | null> {
    const [row] = await tx
      .update(sl)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(sl.id, id), eq(sl.companyId, companyId)))
      .returning();
    return row ?? null;
  }
}

class ZoneRepository extends TenantRepository<typeof warehouseZoneTable> {
  constructor() {
    super(db as never, warehouseZoneTable, "warehouse_zone");
  }
}

class StockMovementRepository extends TenantRepository<typeof warehouseStockMovementTable> {
  constructor() {
    super(db as never, warehouseStockMovementTable, "warehouse_stock_movement");
  }

  async appendTx(tx: Tx, rows: NewStockMovementRecord[]) {
    if (rows.length) await tx.insert(warehouseStockMovementTable).values(rows);
  }
}

class BondedEntryRepository extends TenantRepository<typeof warehouseBondedEntryTable> {
  constructor() {
    super(db as never, warehouseBondedEntryTable, "warehouse_bonded_entry");
  }

  async listWithPosition(companyId: string, limit = 5000): Promise<(BondedEntryRecord & PositionLink)[]> {
    const rows = await db
      .select({ entry: be, positionRef: task.taskId, gateRef: gm.gateRef, jobNumber: gm.jobNumber, movementDeletedAt: gm.deletedAt, movementId: gm.id })
      .from(be)
      .leftJoin(gm, and(eq(gm.id, be.movementId), eq(gm.companyId, be.companyId)))
      .leftJoin(task, eq(task.id, gm.warehouseTaskId))
      .where(and(eq(be.companyId, companyId), isNull(be.deletedAt)))
      .orderBy(desc(be.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r.entry,
      positionRef: r.positionRef,
      gateRef: r.gateRef,
      jobNumber: r.jobNumber,
      positionArchived: !!r.entry.movementId && (!r.movementId || !!r.movementDeletedAt),
    }));
  }

  async autoForMovement(tx: Tx, companyId: string, movementId: string, lock = true): Promise<BondedEntryRecord | null> {
    const q = tx
      .select()
      .from(be)
      .where(and(eq(be.companyId, companyId), eq(be.movementId, movementId), eq(be.source, "auto"), isNull(be.deletedAt)));
    const [row] = lock ? await q.for("update") : await q;
    return row ?? null;
  }

  async manualOpenForMovement(tx: Tx | typeof db, companyId: string, movementId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: be.id })
      .from(be)
      .where(and(eq(be.companyId, companyId), eq(be.movementId, movementId), eq(be.source, "manual"), isNull(be.deletedAt), sql`${be.balance} > 0`))
      .limit(1);
    return !!row;
  }

  async insertAuto(tx: Tx, data: NewBondedEntryRecord): Promise<BondedEntryRecord | null> {
    const [row] = await tx.insert(be).values(data).onConflictDoNothing().returning();
    return row ?? null;
  }

  async updateTx(tx: Tx, id: string, companyId: string, data: Partial<NewBondedEntryRecord>): Promise<BondedEntryRecord | null> {
    const [row] = await tx
      .update(be)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(be.id, id), eq(be.companyId, companyId)))
      .returning();
    return row ?? null;
  }
}

/** A gate record with the WCZ ref of its task, live or archived (for the stock sync). */
export type StockSyncMovement = GateMovementRecord & { positionRef: string | null };

class StockGateReader {
  /**
   * The gate record, live or archived, locked until the transaction ends. Callers that already
   * hold the lock (a stamp's conditional UPDATE, lockLive) take it again at no cost.
   */
  async movementLocked(tx: Tx, companyId: string, movementId: string): Promise<StockSyncMovement | null> {
    const [row] = await tx
      .select({ movement: gm, positionRef: task.taskId })
      .from(gm)
      .leftJoin(task, eq(task.id, gm.warehouseTaskId))
      .where(and(eq(gm.id, movementId), eq(gm.companyId, companyId)))
      .for("update", { of: gm });
    return row ? { ...row.movement, positionRef: row.positionRef } : null;
  }

  /** The same, read without a lock (dry run of the manager sync). */
  async movement(companyId: string, movementId: string): Promise<StockSyncMovement | null> {
    const [row] = await db
      .select({ movement: gm, positionRef: task.taskId })
      .from(gm)
      .leftJoin(task, eq(task.id, gm.warehouseTaskId))
      .where(and(eq(gm.id, movementId), eq(gm.companyId, companyId)));
    return row ? { ...row.movement, positionRef: row.positionRef } : null;
  }

  async liveIds(companyId: string): Promise<string[]> {
    const rows = await db
      .select({ id: gm.id })
      .from(gm)
      .where(and(eq(gm.companyId, companyId), isNull(gm.deletedAt)))
      .orderBy(gm.id);
    return rows.map((r) => r.id);
  }

  async containerNumber(tx: Tx | typeof db, companyId: string, containerId: string): Promise<string> {
    const [row] = await tx
      .select({ number: warehouseContainerTable.number })
      .from(warehouseContainerTable)
      .where(and(eq(warehouseContainerTable.id, containerId), eq(warehouseContainerTable.companyId, companyId)));
    return row?.number ?? "";
  }

  /** Live gate records of the company for the position picker check. */
  async findForCompany(companyId: string, movementId: string): Promise<StockSyncMovement | null> {
    const [row] = await db
      .select({ movement: gm, positionRef: task.taskId })
      .from(gm)
      .leftJoin(task, eq(task.id, gm.warehouseTaskId))
      .where(and(eq(gm.id, movementId), eq(gm.companyId, companyId), isNull(gm.deletedAt)));
    return row ? { ...row.movement, positionRef: row.positionRef } : null;
  }
}

export const stockLineRepository = new StockLineRepository();
export const zoneRepository = new ZoneRepository();
export const stockMovementRepository = new StockMovementRepository();
export const bondedEntryRepository = new BondedEntryRepository();
export const stockGateReader = new StockGateReader();
