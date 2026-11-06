import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import { shipmentTrackingEventTable as t, type NewShipmentTrackingEventRecord, type ShipmentTrackingEventRecord } from "../schemas/shipmentTrackingEvent.schema";

class ShipmentTrackingEventRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "shipment_tracking_event");
  }

  /** A shipment's live events, the latest first. */
  async listByShipmentId(shipmentId: string, companyId: string, limit: number): Promise<ShipmentTrackingEventRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.occurredOn), desc(t.createdAt), desc(t.id))
      .limit(limit);
  }

  /** Each of these shipments' last standing event: no proposal, no plan change (those aren't things that happened). */
  async latestPerShipment(shipmentIds: readonly string[], companyId: string): Promise<Map<string, ShipmentTrackingEventRecord>> {
    if (shipmentIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.shipmentId])
      .from(t)
      .where(and(
        eq(t.companyId, companyId),
        inArray(t.shipmentId, [...shipmentIds]),
        isNull(t.deletedAt),
        inArray(t.effect, ["none", "applied"]),
        notInArray(t.kind, ["eta_changed", "etd_changed", "note"]),
      ))
      .orderBy(t.shipmentId, desc(t.occurredOn), desc(t.createdAt));
    return new Map(rows.map((r) => [r.shipmentId, r]));
  }

  /** Dates sources propose on these shipments, waiting for somebody. */
  async proposedOn(shipmentIds: readonly string[], companyId: string): Promise<ShipmentTrackingEventRecord[]> {
    if (shipmentIds.length === 0) return [];
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, [...shipmentIds]), eq(t.effect, "proposed"), isNull(t.deletedAt)));
  }

  /** Of these shipments, those recorded as arrived at the hub. */
  async arrivedAtHub(shipmentIds: readonly string[], companyId: string): Promise<Set<string>> {
    if (shipmentIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ shipmentId: t.shipmentId })
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, [...shipmentIds]), eq(t.kind, "hub_arrived"), isNull(t.deletedAt)));
    return new Set(rows.map((r) => r.shipmentId));
  }

  async getLive(id: string, shipmentId: string, companyId: string): Promise<ShipmentTrackingEventRecord | null> {
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** The newest live event of a kind on a day, in `tx` when given. */
  async findSameDay(shipmentId: string, companyId: string, kind: string, day: string, tx?: Tx): Promise<ShipmentTrackingEventRecord | null> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.kind, kind), eq(t.occurredOn, day), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt))
      .limit(1);
    return row ?? null;
  }

  async add(row: NewShipmentTrackingEventRecord, tx?: Tx): Promise<ShipmentTrackingEventRecord> {
    const [created] = await (tx ?? this.db).insert(t).values(row).returning();
    return created!;
  }

  /** Adds the event unless the source already sent it (its external id). */
  async addOnce(row: NewShipmentTrackingEventRecord): Promise<void> {
    await this.db.insert(t).values(row).onConflictDoNothing();
  }

  /** The live events of these kinds on these shipments. */
  async ofKinds(shipmentIds: readonly string[], companyId: string, kinds: readonly string[]): Promise<ShipmentTrackingEventRecord[]> {
    if (shipmentIds.length === 0) return [];
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, [...shipmentIds]), inArray(t.kind, [...kinds]), isNull(t.deletedAt)));
  }

  async softDeleteByExternalId(shipmentId: string, companyId: string, source: string, externalId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.source, source), eq(t.externalId, externalId), isNull(t.deletedAt)));
  }

  async change(id: string, companyId: string, data: Partial<NewShipmentTrackingEventRecord>): Promise<ShipmentTrackingEventRecord | null> {
    const [row] = await this.db
      .update(t)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Closes the shipment's open exceptions of the given kinds. */
  async resolveOpen(shipmentId: string, companyId: string, kinds: readonly string[], userId: string, tx?: Tx): Promise<void> {
    await (tx ?? this.db)
      .update(t)
      .set({ resolvedAt: sql`now()`, resolvedById: userId, updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), inArray(t.kind, [...kinds]), isNull(t.resolvedAt), isNull(t.deletedAt)));
  }
}

export const shipmentTrackingEventRepository = new ShipmentTrackingEventRepository();
