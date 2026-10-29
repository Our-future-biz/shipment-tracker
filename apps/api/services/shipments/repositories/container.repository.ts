import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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

  // Sync the shipment's containers to the provided list while keeping row ids
  // stable — cargo_item/cargo_dimension rows point at container ids, so rows must
  // be updated in place, not replaced. Which row each line updates is matchContainerRows'
  // (by id, a client-made id for a new row, else by position). Existing rows no line
  // claims are deleted; their cargo lines go with them (ON DELETE CASCADE) unless the
  // caller moved them off first. A client-made id that some other container already has
  // (any shipment's, any company's) is not used: the new row gets an id of its own. The
  // answer maps each such client id to the id the row got, for the cargo lines of the same
  // write that name it.
  async syncForShipment(shipmentId: string, companyId: string, lines: ContainerLine[], tx: Tx | typeof db = db): Promise<Map<string, string>> {
    const existing = await this.listByShipmentId(shipmentId, companyId, tx);
    const resolved = matchContainerRows(existing.map((r) => r.id), lines);
    const claimed = new Set(resolved.flatMap((r) => (r.id ? [r.id] : [])));
    const renamed = new Map<string, string>();

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
      } else if (insertId) {
        const [kept] = await tx
          .insert(containerTable)
          .values({ ...values, id: insertId })
          .onConflictDoNothing({ target: containerTable.id })
          .returning({ id: containerTable.id });
        if (!kept) {
          const [own] = await tx.insert(containerTable).values(values).returning({ id: containerTable.id });
          renamed.set(insertId, own!.id);
        }
      } else {
        await tx.insert(containerTable).values(values);
      }
    }
    return renamed;
  }
}

export const containerRepository = new ContainerRepository();
