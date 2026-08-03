import { eq, inArray, asc } from "drizzle-orm";
import { db } from "../db/db";
import { containerTable } from "../schemas/container.schema";
import type { ContainerLine } from "../interfaces/interfaces";

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

  // Replace-all: containers are edited as a single list, so drop the shipment's
  // existing rows and insert the provided set. `position` preserves list order,
  // since a batch insert shares one created_at.
  async replaceForShipment(shipmentId: string, rows: ContainerLine[]) {
    await db.delete(containerTable).where(eq(containerTable.shipmentId, shipmentId));
    if (rows.length > 0) {
      await db.insert(containerTable).values(rows.map((r, i) => ({ ...r, shipmentId, position: i })));
    }
  }
}

export const containerRepository = new ContainerRepository();
