import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import { containerTable, type ContainerRecord } from "../schemas/container.schema";
import { matchContainerRows, normalizeContainerNumber, teuForType } from "../lib/cargoProjection";
import type { ContainerLine } from "../interfaces/interfaces";

class ContainerRepository extends TenantRepository<typeof containerTable> {
  constructor() {
    super(db, containerTable, "container");
  }

  async listByShipmentId(shipmentId: string, companyId: string, tx: Tx | typeof db = db): Promise<ContainerRecord[]> {
    return this.listByShipmentIds([shipmentId], companyId, tx);
  }

  async listByShipmentIds(shipmentIds: string[], companyId: string, tx: Tx | typeof db = db): Promise<ContainerRecord[]> {
    if (shipmentIds.length === 0) return [];
    return tx
      .select()
      .from(containerTable)
      .where(
        and(
          eq(containerTable.companyId, companyId),
          inArray(containerTable.shipmentId, shipmentIds),
          isNull(containerTable.deletedAt),
        ),
      )
      .orderBy(asc(containerTable.position), asc(containerTable.createdAt));
  }

  /**
   * Runs `work` in one transaction that holds the shipment's detail-rows turn: its containers
   * and cargo lines are written all or nothing, and two writes of them take turns (the lock
   * lasts until the transaction ends), so a line list is never half replaced or stored twice.
   */
  async withDetailRowsLock<T>(shipmentId: string, companyId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shipments-detail-rows:${companyId}:${shipmentId}`}))`);
      return work(tx);
    });
  }

  // Sync the shipment's containers to the provided list while keeping row ids
  // stable — cargo_item/cargo_dimension rows point at container ids, so rows must
  // be updated in place, not replaced. Which row each line updates is matchContainerRows'
  // (by id, a client-made id for a new row, else by position). Existing rows no line
  // claims are deleted; their cargo lines go with them (ON DELETE CASCADE) unless the
  // caller moved them off first.
  async syncForShipment(shipmentId: string, companyId: string, lines: ContainerLine[], tx: Tx | typeof db = db): Promise<void> {
    const existing = await this.listByShipmentId(shipmentId, companyId, tx);
    const resolved = matchContainerRows(existing.map((r) => r.id), lines);
    const claimed = new Set(resolved.flatMap((r) => (r.id ? [r.id] : [])));

    const removedIds = existing.filter((r) => !claimed.has(r.id)).map((r) => r.id);
    if (removedIds.length > 0) {
      await tx
        .delete(containerTable)
        .where(and(eq(containerTable.companyId, companyId), inArray(containerTable.id, removedIds)));
    }

    for (let i = 0; i < resolved.length; i++) {
      const { line, id, insertId } = resolved[i]!;
      const values = {
        companyId,
        shipmentId,
        position: i,
        containerNumber: normalizeContainerNumber(line.containerNumber),
        sealNumber: line.sealNumber,
        type: line.type,
        teu: teuForType(line.type),
        packages: line.packages,
        packageType: line.packageType,
        grossWeight: line.grossWeight,
        volume: line.volume,
      };
      if (id) {
        await tx
          .update(containerTable)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(containerTable.companyId, companyId), eq(containerTable.id, id)));
      } else {
        await tx.insert(containerTable).values(insertId ? { ...values, id: insertId } : values);
      }
    }
  }
}

export const containerRepository = new ContainerRepository();
