import { and, asc, eq, gt, inArray, isNull, like, lt, ne, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import type { GateEvent } from "../schemas/gateMovement.schema";
import type { Tx } from "./warehouseSection.repository";
import {
  warehouseClaimTable,
  warehouseContainerPositionTable,
  warehouseContainerTable,
  warehouseDockSlotTable,
  warehouseEquipmentTable,
  warehouseSavedReportTable,
  warehouseStaffTable,
} from "../schemas/warehouseRecords.schema";

const ct = warehouseContainerTable;
const cp = warehouseContainerPositionTable;

/** A container of a position, as the gate job and the surveys read it. */
export type MovementContainerRef = { id: string; number: string; equipment: string; movementId: string };

class WarehouseContainerRepository extends TenantRepository<typeof warehouseContainerTable> {
  constructor() {
    super(db, warehouseContainerTable, "warehouse_container");
  }

  // The containers of these positions: the one each is a house of (warehouse_container_position),
  // and the containers still linked the legacy way (movement_id) — a position that had several
  // containers before containers held many positions keeps them all for its surveys.
  async listForMovements(movementIds: string[], companyId: string): Promise<MovementContainerRef[]> {
    if (!movementIds.length) return [];
    const legacy = await this.db
      .select({ id: ct.id, number: ct.number, equipment: ct.equipment, movementId: ct.movementId, createdAt: ct.createdAt })
      .from(ct)
      .where(and(eq(ct.companyId, companyId), inArray(ct.movementId, movementIds), isNull(ct.deletedAt)))
      .orderBy(ct.createdAt);
    const linked: typeof legacy = await this.db
      .select({ id: ct.id, number: ct.number, equipment: ct.equipment, movementId: cp.movementId, createdAt: ct.createdAt })
      .from(cp)
      .innerJoin(ct, and(eq(ct.id, cp.containerId), isNull(ct.deletedAt)))
      .where(and(eq(cp.companyId, companyId), inArray(cp.movementId, movementIds), isNull(cp.deletedAt)));
    const seen = new Set<string>();
    const out: MovementContainerRef[] = [];
    for (const r of [...linked, ...legacy]) {
      const key = `${r.movementId}:${r.id}`;
      if (!r.movementId || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: r.id, number: r.number, equipment: r.equipment, movementId: r.movementId });
    }
    return out;
  }

  async findById(id: string, companyId: string, tx: Tx | typeof db = db) {
    const [row] = await tx.select().from(ct).where(and(eq(ct.id, id), eq(ct.companyId, companyId), isNull(ct.deletedAt)));
    return row ?? null;
  }

  async findByIds(ids: string[], companyId: string, tx: Tx | typeof db = db) {
    if (!ids.length) return [];
    return tx.select().from(ct).where(and(inArray(ct.id, ids), eq(ct.companyId, companyId), isNull(ct.deletedAt)));
  }

  // The live container, locked until the transaction ends. Every change of a container's houses
  // or stamps locks it first (then the positions, ordered by id), so they never deadlock.
  async lock(tx: Tx, id: string, companyId: string) {
    const [row] = await tx.select().from(ct).where(and(eq(ct.id, id), eq(ct.companyId, companyId), isNull(ct.deletedAt))).for("update");
    return row ?? null;
  }

  // One conditional UPDATE that appends `events` in SQL, only while `cond` holds; null otherwise.
  async conditionalUpdate(tx: Tx | typeof db, id: string, companyId: string, set: PgUpdateSetSource<typeof warehouseContainerTable>, events: GateEvent[], cond?: SQL) {
    const [row] = await tx
      .update(ct)
      .set({ ...set, events: sql`${ct.events} || ${JSON.stringify(events)}::jsonb`, updatedAt: new Date() })
      .where(and(eq(ct.id, id), eq(ct.companyId, companyId), isNull(ct.deletedAt), cond))
      .returning();
    return row ?? null;
  }
}

class ContainerPositionRepository {
  // Live houses of these containers, in their order.
  async listForContainers(containerIds: string[], companyId: string, tx: Tx | typeof db = db) {
    if (!containerIds.length) return [];
    return tx
      .select()
      .from(cp)
      .where(and(eq(cp.companyId, companyId), inArray(cp.containerId, containerIds), isNull(cp.deletedAt)))
      .orderBy(asc(cp.sequence), asc(cp.createdAt));
  }

  // The live house of each of these positions (a position is in at most one container).
  async liveForMovements(movementIds: string[], companyId: string, tx: Tx | typeof db = db) {
    if (!movementIds.length) return [];
    return tx
      .select()
      .from(cp)
      .where(and(eq(cp.companyId, companyId), inArray(cp.movementId, movementIds), isNull(cp.deletedAt)));
  }

  async liveForMovement(tx: Tx | typeof db, movementId: string, companyId: string) {
    const [row] = await tx.select().from(cp).where(and(eq(cp.companyId, companyId), eq(cp.movementId, movementId), isNull(cp.deletedAt)));
    return row ?? null;
  }

  async findInContainer(tx: Tx | typeof db, containerId: string, movementId: string, companyId: string) {
    const [row] = await tx
      .select()
      .from(cp)
      .where(and(eq(cp.companyId, companyId), eq(cp.containerId, containerId), eq(cp.movementId, movementId), isNull(cp.deletedAt)));
    return row ?? null;
  }

  async add(tx: Tx, rows: (typeof cp.$inferInsert)[]) {
    if (!rows.length) return [];
    return tx.insert(cp).values(rows).returning();
  }

  // Updates a live house only while `cond` holds; null otherwise.
  async update(tx: Tx | typeof db, id: string, companyId: string, set: PgUpdateSetSource<typeof warehouseContainerPositionTable>, cond?: SQL) {
    const [row] = await tx
      .update(cp)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(cp.id, id), eq(cp.companyId, companyId), isNull(cp.deletedAt), cond))
      .returning();
    return row ?? null;
  }

  async softRemove(tx: Tx | typeof db, ids: string[], companyId: string) {
    if (!ids.length) return [];
    const now = new Date();
    return tx
      .update(cp)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(inArray(cp.id, ids), eq(cp.companyId, companyId), isNull(cp.deletedAt)))
      .returning();
  }
}

const ds = warehouseDockSlotTable;

class WarehouseDockSlotRepository extends TenantRepository<typeof warehouseDockSlotTable> {
  constructor() {
    super(db, warehouseDockSlotTable, "warehouse_dock_slot");
  }

  // Live slots of these movements (every status), earliest first.
  async listForMovements(movementIds: string[], companyId: string) {
    if (!movementIds.length) return [];
    return this.db
      .select()
      .from(ds)
      .where(and(eq(ds.companyId, companyId), inArray(ds.movementId, movementIds), isNull(ds.deletedAt)))
      .orderBy(asc(ds.startsAt), asc(ds.createdAt));
  }

  // The booked slots of positions taken out of the warehouse are cancelled, so they stop
  // holding the dock door (slots in progress or done stay as the record of what happened).
  async cancelForMovements(tx: Tx, movementIds: string[], companyId: string, note: string): Promise<number> {
    if (!movementIds.length) return 0;
    const rows = await tx
      .update(ds)
      .set({ status: "Cancelled", note: sql`trim(both ' ·' from ${ds.note} || ' · ' || ${note})`, updatedAt: new Date() })
      .where(and(eq(ds.companyId, companyId), inArray(ds.movementId, movementIds), isNull(ds.deletedAt), inArray(ds.status, ["Booked", "Overdue"])))
      .returning({ id: ds.id });
    return rows.length;
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
    super(db, warehouseStaffTable, "warehouse_staff");
  }
}

class WarehouseEquipmentRepository extends TenantRepository<typeof warehouseEquipmentTable> {
  constructor() {
    super(db, warehouseEquipmentTable, "warehouse_equipment");
  }
}

class WarehouseClaimRepository extends TenantRepository<typeof warehouseClaimTable> {
  constructor() {
    super(db, warehouseClaimTable, "warehouse_claim");
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
    super(db, warehouseSavedReportTable, "warehouse_saved_report");
  }
}

export const containerRepository = new WarehouseContainerRepository();
export const containerPositionRepository = new ContainerPositionRepository();
export const dockSlotRepository = new WarehouseDockSlotRepository();
export const staffRepository = new WarehouseStaffRepository();
export const equipmentRepository = new WarehouseEquipmentRepository();
export const claimRepository = new WarehouseClaimRepository();
export const savedReportRepository = new WarehouseSavedReportRepository();
