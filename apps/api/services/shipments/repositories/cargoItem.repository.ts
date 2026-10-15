import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { cargoItemTable, type CargoItemRecord } from "../schemas/cargoItem.schema";
import type { CargoItemLine } from "../interfaces/interfaces";

class CargoItemRepository extends TenantRepository<typeof cargoItemTable> {
  constructor() {
    super(db, cargoItemTable, "cargo_item");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<CargoItemRecord[]> {
    return this.listByShipmentIds([shipmentId], companyId);
  }

  async listByShipmentIds(shipmentIds: string[], companyId: string): Promise<CargoItemRecord[]> {
    if (shipmentIds.length === 0) return [];
    return this.db
      .select()
      .from(cargoItemTable)
      .where(
        and(
          eq(cargoItemTable.companyId, companyId),
          inArray(cargoItemTable.shipmentId, shipmentIds),
          isNull(cargoItemTable.deletedAt),
        ),
      )
      .orderBy(asc(cargoItemTable.position), asc(cargoItemTable.createdAt));
  }

  // Replace-all: cargo lines are edited as one list and nothing references their
  // ids, so drop the shipment's rows and insert the provided set. `position`
  // preserves list order.
  async replaceForShipment(shipmentId: string, companyId: string, lines: CargoItemLine[]): Promise<void> {
    await this.db
      .delete(cargoItemTable)
      .where(and(eq(cargoItemTable.companyId, companyId), eq(cargoItemTable.shipmentId, shipmentId)));
    if (lines.length === 0) return;
    await this.db.insert(cargoItemTable).values(
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

export const cargoItemRepository = new CargoItemRepository();
