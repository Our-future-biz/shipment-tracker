import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { containerTable, type ContainerRecord } from "../schemas/container.schema";
import { normalizeContainerNumber, teuForType } from "../lib/cargoProjection";
import type { ContainerLine } from "../interfaces/interfaces";

class ContainerRepository extends TenantRepository<typeof containerTable> {
  constructor() {
    super(db, containerTable, "container");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<ContainerRecord[]> {
    return this.listByShipmentIds([shipmentId], companyId);
  }

  async listByShipmentIds(shipmentIds: string[], companyId: string): Promise<ContainerRecord[]> {
    if (shipmentIds.length === 0) return [];
    return this.db
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
  // be updated in place, not replaced. Lines are matched to existing rows by id;
  // id-less lines adopt the unclaimed existing row at the same position (clients
  // like the create wizard or document extraction don't echo ids). Existing rows
  // no line claims are deleted; their cargo lines go with them (ON DELETE CASCADE).
  async syncForShipment(shipmentId: string, companyId: string, lines: ContainerLine[]): Promise<void> {
    const existing = await this.listByShipmentId(shipmentId, companyId);
    const existingIds = new Set(existing.map((r) => r.id));
    const claimed = new Set<string>();

    const resolved: { line: ContainerLine; id: string | null }[] = lines.map((line) => {
      if (line.id && existingIds.has(line.id) && !claimed.has(line.id)) {
        claimed.add(line.id);
        return { line, id: line.id };
      }
      return { line, id: null };
    });
    resolved.forEach((r, i) => {
      if (r.id) return;
      const candidate = existing[i];
      if (candidate && !claimed.has(candidate.id)) {
        claimed.add(candidate.id);
        r.id = candidate.id;
      }
    });

    const removedIds = existing.filter((r) => !claimed.has(r.id)).map((r) => r.id);
    if (removedIds.length > 0) {
      await this.db
        .delete(containerTable)
        .where(and(eq(containerTable.companyId, companyId), inArray(containerTable.id, removedIds)));
    }

    for (let i = 0; i < resolved.length; i++) {
      const { line, id } = resolved[i]!;
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
        await this.db
          .update(containerTable)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(containerTable.companyId, companyId), eq(containerTable.id, id)));
      } else {
        await this.db.insert(containerTable).values(values);
      }
    }
  }
}

export const containerRepository = new ContainerRepository();
