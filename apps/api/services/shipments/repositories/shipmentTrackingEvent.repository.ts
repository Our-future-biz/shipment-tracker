import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
