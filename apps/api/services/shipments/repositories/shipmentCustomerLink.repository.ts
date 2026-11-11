import { and, desc, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { shipmentCustomerLinkTable as t, type NewShipmentCustomerLinkRecord, type ShipmentCustomerLinkRecord } from "../schemas/shipmentCustomerLink.schema";

const live = (shipmentId: string, companyId: string) => and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.revokedAt), isNull(t.deletedAt));

class ShipmentCustomerLinkRepository {
  /** The shipment's live link; null when there is none. */
  async liveOf(shipmentId: string, companyId: string): Promise<ShipmentCustomerLinkRecord | null> {
    const [row] = await db.select().from(t).where(live(shipmentId, companyId)).orderBy(desc(t.createdAt)).limit(1);
    return row ?? null;
  }

  /** The live link a token opens, of any company: the token is the only key the page has. */
  async liveByHash(tokenHash: string): Promise<ShipmentCustomerLinkRecord | null> {
    const [row] = await db.select().from(t).where(and(eq(t.tokenHash, tokenHash), isNull(t.revokedAt), isNull(t.deletedAt))).limit(1);
    return row ?? null;
  }

  /**
   * A new link in place of the live one, in `tx`: the old URL stops working as the new one starts.
   * `tx` holds the shipment's write turn (shipmentRepository.writeTurn), so two new links of one
   * shipment at the same moment take turns - the later one ends the earlier one's link - where both
   * would otherwise find no live link and the second break the one-live-link index.
   */
  async replace(tx: Tx, row: NewShipmentCustomerLinkRecord): Promise<ShipmentCustomerLinkRecord> {
    await tx.update(t).set({ revokedAt: new Date(), revokedById: row.createdById, updatedAt: new Date() }).where(live(row.shipmentId, row.companyId));
    const [created] = await tx.insert(t).values(row).returning();
    return created!;
  }

  async revoke(shipmentId: string, companyId: string, userId: string): Promise<boolean> {
    const rows = await db.update(t).set({ revokedAt: new Date(), revokedById: userId, updatedAt: new Date() }).where(live(shipmentId, companyId)).returning({ id: t.id });
    return rows.length > 0;
  }

  async touchOpened(id: string, at: Date): Promise<void> {
    await db.update(t).set({ lastOpenedAt: at }).where(eq(t.id, id));
  }
}

export const shipmentCustomerLinkRepository = new ShipmentCustomerLinkRepository();
