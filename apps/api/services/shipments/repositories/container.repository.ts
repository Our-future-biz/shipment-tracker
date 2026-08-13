import { eq, inArray, asc } from "drizzle-orm";
import { db } from "../db/db";
import { containerTable } from "../schemas/container.schema";
import { cargoItemTable } from "../schemas/cargoItem.schema";
import { cargoDimensionTable } from "../schemas/cargoDimension.schema";
import { teuForType } from "../services/cargoProjection";
import type { ContainerLine } from "../interfaces/interfaces";

// A container number is 4 letters + 7 digits (ISO 6346). It is stored in one
// canonical form — uppercase, with no spaces/hyphens/other separators — no matter
// how it was entered or read (e.g. "MSMU 272727-7" → "MSMU2727277").
export function normalizeContainerNumber(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

class ContainerRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(containerTable)
      .where(eq(containerTable.shipmentId, shipmentId))
      .orderBy(asc(containerTable.position), asc(containerTable.createdAt));
  }

  async listByShipmentIds(shipmentIds: string[]) {
    if (shipmentIds.length === 0) return [];
    return db
      .select()
      .from(containerTable)
      .where(inArray(containerTable.shipmentId, shipmentIds))
      .orderBy(asc(containerTable.position), asc(containerTable.createdAt));
  }

  // Sync the shipment's containers to the provided list while keeping row ids
  // stable — cargo_item/cargo_dimension rows point at container ids, so rows must
  // be updated in place, not replaced. Lines are matched to existing rows by id;
  // id-less lines adopt the unclaimed existing row at the same position (clients
  // like the create wizard or document extraction don't echo ids). Existing rows
  // no line claims are deleted together with their cargo lines.
  async syncForShipment(shipmentId: string, companyId: string, lines: ContainerLine[]) {
    const existing = await this.listByShipmentId(shipmentId);
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
      await db.delete(cargoItemTable).where(inArray(cargoItemTable.containerId, removedIds));
      await db.delete(cargoDimensionTable).where(inArray(cargoDimensionTable.containerId, removedIds));
      await db.delete(containerTable).where(inArray(containerTable.id, removedIds));
    }

    for (let i = 0; i < resolved.length; i++) {
      const { line, id } = resolved[i];
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
        await db.update(containerTable).set(values).where(eq(containerTable.id, id));
      } else {
        await db.insert(containerTable).values(values);
      }
    }
  }
}

export const containerRepository = new ContainerRepository();
