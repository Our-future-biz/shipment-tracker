import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { datesToTell } from "../lib/customerNotice";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentCustomerNoticeTable as t, type NewShipmentCustomerNoticeRecord, type ShipmentCustomerNoticeRecord } from "../schemas/shipmentCustomerNotice.schema";

/** A notice to write on a shipment, all but the dates it keeps a copy of (they are its shipment's). */
export type NoticeToWrite = Pick<NewShipmentCustomerNoticeRecord, "shipmentId" | "kind" | "channel" | "toldTo" | "subject" | "note" | "toldById">;

class ShipmentCustomerNoticeRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "shipment_customer_notice");
  }

  /** What the customer was told about a shipment, the latest first. */
  async listByShipmentId(shipmentId: string, companyId: string, limit: number): Promise<ShipmentCustomerNoticeRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(limit);
  }

  /** These shipments' notices of one kind, the latest first: who told the customer what, and when. */
  async ofKind(shipmentIds: readonly string[], kind: string, companyId: string): Promise<ShipmentCustomerNoticeRecord[]> {
    if (shipmentIds.length === 0) return [];
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, [...shipmentIds]), eq(t.kind, kind), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt))
      .limit(2000);
  }

  /**
   * Writes these notices together, all or none (a sailing's customers told at once, Council Outlay
   * 14, C6): one insert in one transaction, so a failure leaves none of them written and a second
   * try writes no copy. Each keeps the dates of its shipment as they stand (lib/customerNotice
   * datesToTell). Only the company's live shipments take one: false, with nothing written, when one
   * of them is not found.
   */
  async createForShipments(companyId: string, notices: readonly NoticeToWrite[]): Promise<boolean> {
    if (notices.length === 0) return true;
    return this.db.transaction(async (tx) => {
      const ids = [...new Set(notices.map((n) => n.shipmentId))];
      const shipments = await tx
        .select({ id: shipmentTable.id, estimatedArrival: shipmentTable.estimatedArrival, etaWarehouse: shipmentTable.etaWarehouse, plannedDeliveryDate: shipmentTable.plannedDeliveryDate })
        .from(shipmentTable)
        .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.id, ids), isNull(shipmentTable.deletedAt)));
      if (shipments.length !== ids.length) return false;
      const byId = new Map(shipments.map((s) => [s.id, s]));
      await tx.insert(t).values(notices.map((n) => ({ ...n, companyId, ...datesToTell(byId.get(n.shipmentId)!) })));
      return true;
    });
  }

  /** Each of these shipments' latest notice. */
  async latestPerShipment(shipmentIds: readonly string[], companyId: string): Promise<Map<string, ShipmentCustomerNoticeRecord>> {
    if (shipmentIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.shipmentId])
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, [...shipmentIds]), isNull(t.deletedAt)))
      .orderBy(t.shipmentId, desc(t.createdAt));
    return new Map(rows.map((r) => [r.shipmentId, r]));
  }
}

export const shipmentCustomerNoticeRepository = new ShipmentCustomerNoticeRepository();
