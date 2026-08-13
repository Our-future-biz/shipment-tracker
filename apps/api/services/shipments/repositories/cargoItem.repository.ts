import { eq, inArray, asc } from "drizzle-orm";
import { db } from "../db/db";
import { cargoItemTable } from "../schemas/cargoItem.schema";
import type { CargoItemLine } from "../interfaces/interfaces";

class CargoItemRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(cargoItemTable)
      .where(eq(cargoItemTable.shipmentId, shipmentId))
      .orderBy(asc(cargoItemTable.position), asc(cargoItemTable.createdAt));
  }

  async listByShipmentIds(shipmentIds: string[]) {
    if (shipmentIds.length === 0) return [];
    return db
      .select()
      .from(cargoItemTable)
      .where(inArray(cargoItemTable.shipmentId, shipmentIds))
      .orderBy(asc(cargoItemTable.position), asc(cargoItemTable.createdAt));
  }

  // Replace-all: cargo lines are edited as one list and nothing references their
  // ids, so drop the shipment's rows and insert the provided set. `position`
  // preserves list order.
  async replaceForShipment(shipmentId: string, companyId: string, lines: CargoItemLine[]) {
    await db.delete(cargoItemTable).where(eq(cargoItemTable.shipmentId, shipmentId));
    if (lines.length > 0) {
      await db.insert(cargoItemTable).values(
        lines.map((l, i) => ({
          companyId,
          shipmentId,
          containerId: l.containerId || null,
          position: i,
          cargoDescription: l.cargoDescription,
          hsCode: l.hsCode,
          pieces: l.pieces,
          packageType: l.packageType,
          grossWeight: l.grossWeight,
          commercialInvoiceValue: l.commercialInvoiceValue,
          currency: l.currency,
        })),
      );
    }
  }
}

export const cargoItemRepository = new CargoItemRepository();
