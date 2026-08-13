import { eq, inArray, asc } from "drizzle-orm";
import { db } from "../db/db";
import { cargoDimensionTable } from "../schemas/cargoDimension.schema";
import type { CargoDimensionLine } from "../interfaces/interfaces";

class CargoDimensionRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(cargoDimensionTable)
      .where(eq(cargoDimensionTable.shipmentId, shipmentId))
      .orderBy(asc(cargoDimensionTable.position), asc(cargoDimensionTable.createdAt));
  }

  async listByShipmentIds(shipmentIds: string[]) {
    if (shipmentIds.length === 0) return [];
    return db
      .select()
      .from(cargoDimensionTable)
      .where(inArray(cargoDimensionTable.shipmentId, shipmentIds))
      .orderBy(asc(cargoDimensionTable.position), asc(cargoDimensionTable.createdAt));
  }

  // Replace-all: dimension lines are edited as one list and nothing references
  // their ids, so drop the shipment's rows and insert the provided set.
  async replaceForShipment(shipmentId: string, companyId: string, lines: CargoDimensionLine[]) {
    await db.delete(cargoDimensionTable).where(eq(cargoDimensionTable.shipmentId, shipmentId));
    if (lines.length > 0) {
      await db.insert(cargoDimensionTable).values(
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
        })),
      );
    }
  }
}

export const cargoDimensionRepository = new CargoDimensionRepository();
