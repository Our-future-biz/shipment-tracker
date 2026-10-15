import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { cargoDimensionTable, type CargoDimensionRecord } from "../schemas/cargoDimension.schema";
import type { CargoDimensionLine } from "../interfaces/interfaces";

class CargoDimensionRepository extends TenantRepository<typeof cargoDimensionTable> {
  constructor() {
    super(db, cargoDimensionTable, "cargo_dimension");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<CargoDimensionRecord[]> {
    return this.listByShipmentIds([shipmentId], companyId);
  }

  async listByShipmentIds(shipmentIds: string[], companyId: string): Promise<CargoDimensionRecord[]> {
    if (shipmentIds.length === 0) return [];
    return this.db
      .select()
      .from(cargoDimensionTable)
      .where(
        and(
          eq(cargoDimensionTable.companyId, companyId),
          inArray(cargoDimensionTable.shipmentId, shipmentIds),
          isNull(cargoDimensionTable.deletedAt),
        ),
      )
      .orderBy(asc(cargoDimensionTable.position), asc(cargoDimensionTable.createdAt));
  }

  // Replace-all: dimension lines are edited as one list and nothing references
  // their ids, so drop the shipment's rows and insert the provided set.
  async replaceForShipment(shipmentId: string, companyId: string, lines: CargoDimensionLine[]): Promise<void> {
    await this.db
      .delete(cargoDimensionTable)
      .where(and(eq(cargoDimensionTable.companyId, companyId), eq(cargoDimensionTable.shipmentId, shipmentId)));
    if (lines.length === 0) return;
    await this.db.insert(cargoDimensionTable).values(
      lines.map((l, i) => ({
        companyId,
        shipmentId,
        containerId: l.containerId || null,
        position: i,
        pieces: l.pieces,
        lengthCm: l.lengthCm,
        widthCm: l.widthCm,
        heightCm: l.heightCm,
        weightPerPcKg: l.weightPerPcKg,
        packageType: l.packageType,
        stackable: l.stackable,
        palletType: l.palletType ?? null,
        adrUn: l.adrUn ?? null,
        adrClass: l.adrClass ?? null,
        adrPackingGroup: l.adrPackingGroup ?? null,
        adrLimitedQuantity: l.adrLimitedQuantity ?? false,
      })),
    );
  }
}

export const cargoDimensionRepository = new CargoDimensionRepository();
