import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentAlertReadTable } from "../schemas/shipmentAlertRead.schema";

class ShipmentAlertReadRepository {
  /** When the user last opened the shipment's Alerts; null when never. */
  async readAt(companyId: string, userId: string, shipmentId: string): Promise<Date | null> {
    const [row] = await db
      .select({ readAt: shipmentAlertReadTable.readAt })
      .from(shipmentAlertReadTable)
      .where(and(
        eq(shipmentAlertReadTable.companyId, companyId),
        eq(shipmentAlertReadTable.userId, userId),
        eq(shipmentAlertReadTable.shipmentId, shipmentId),
      ))
      .limit(1);
    return row?.readAt ?? null;
  }

  async markRead(companyId: string, userId: string, shipmentId: string): Promise<void> {
    await db
      .insert(shipmentAlertReadTable)
      .values({ companyId, userId, shipmentId, readAt: new Date() })
      .onConflictDoUpdate({
        target: [shipmentAlertReadTable.userId, shipmentAlertReadTable.shipmentId],
        set: { readAt: new Date(), updatedAt: new Date() },
      });
  }
}

export const shipmentAlertReadRepository = new ShipmentAlertReadRepository();
