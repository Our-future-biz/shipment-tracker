import { and, desc, eq, getTableColumns, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import type { HeldFactField } from "../lib/trackingEvents";
import { shipmentTable as s } from "../schemas/shipment.schema";
import { shipmentTrackingEventTable as t, type NewShipmentTrackingEventRecord, type ShipmentTrackingEventRecord } from "../schemas/shipmentTrackingEvent.schema";

// What happened, or a fact with no date to set: a proposal waits for somebody, a dismissed one is
// set aside (turned down, or a date the shipment no longer holds).
const STANDING = ["none", "applied"];

const HELD_COLUMNS: Record<HeldFactField, PgColumn> = {
  actualDeparture: s.actualDeparture,
  actualArrival: s.actualArrival,
  warehouseReceivedDate: s.warehouseReceivedDate,
  warehouseReleasedDate: s.warehouseReleasedDate,
  actualDeliveryDate: s.actualDeliveryDate,
};

// An event that set an actual date stands while the shipment holds that day; for any other the
// CASE gives its own value back. Needs the shipment joined.
const STILL_HELD = sql`(${t.effect} <> 'applied' OR CASE ${t.effectField} ${sql.join(
  Object.entries(HELD_COLUMNS).map(([field, column]) => sql`WHEN ${field} THEN ${column}`),
  sql` `,
)} ELSE ${t.effectValue} END IS NOT DISTINCT FROM ${t.effectValue})`;

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

  /**
   * Each of these shipments' last standing event: no proposal, no plan change (those aren't things
   * that happened), and no date the shipment no longer holds (corrected or cleared since).
   */
  async latestPerShipment(shipmentIds: readonly string[], companyId: string): Promise<Map<string, ShipmentTrackingEventRecord>> {
    if (shipmentIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.shipmentId], getTableColumns(t))
      .from(t)
      .innerJoin(s, eq(s.id, t.shipmentId))
      .where(and(
        eq(t.companyId, companyId),
        inArray(t.shipmentId, [...shipmentIds]),
        isNull(t.deletedAt),
        inArray(t.effect, STANDING),
        notInArray(t.kind, ["eta_changed", "etd_changed", "note"]),
        STILL_HELD,
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

  /** The newest standing event of a kind on a day, in `tx` when given: a proposal or a dismissed one isn't the fact. */
  async findSameDay(shipmentId: string, companyId: string, kind: string, day: string, tx?: Tx): Promise<ShipmentTrackingEventRecord | null> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.kind, kind), eq(t.occurredOn, day), inArray(t.effect, STANDING), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** The newest standing event of a kind, whatever its day: the last one written. In `tx` when given. */
  async latestOfKind(shipmentId: string, companyId: string, kind: string, tx?: Tx): Promise<ShipmentTrackingEventRecord | null> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.kind, kind), inArray(t.effect, STANDING), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt))
      .limit(1);
    return row ?? null;
  }

  /**
   * The shipment's field now holds `value` (null: cleared): the facts that set it to another day are
   * set aside as dismissed, by who changed it. They stay on record, off the timeline and the list.
   */
  async supersede(shipmentId: string, companyId: string, field: string, value: string | null, userId: string, tx?: Tx): Promise<void> {
    const now = new Date();
    await (tx ?? this.db)
      .update(t)
      .set({ effect: "dismissed", decidedById: userId, decidedAt: now, updatedAt: now })
      .where(and(
        eq(t.companyId, companyId),
        eq(t.shipmentId, shipmentId),
        eq(t.effect, "applied"),
        eq(t.effectField, field),
        isNull(t.deletedAt),
        value === null ? undefined : or(isNull(t.effectValue), ne(t.effectValue, value)),
      ));
  }

  /**
   * The shipment's field now holds `value`: what a source proposed of that day is confirmed by who
   * set it, and a fact set aside for it stands again.
   */
  async settle(shipmentId: string, companyId: string, field: string, value: string, userId: string, tx?: Tx): Promise<void> {
    const now = new Date();
    await (tx ?? this.db)
      .update(t)
      .set({ effect: "applied", decidedById: userId, decidedAt: now, updatedAt: now })
      .where(and(
        eq(t.companyId, companyId),
        eq(t.shipmentId, shipmentId),
        inArray(t.effect, ["proposed", "dismissed"]),
        eq(t.effectField, field),
        eq(t.effectValue, value),
        isNull(t.deletedAt),
      ));
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

  async change(id: string, companyId: string, data: Partial<NewShipmentTrackingEventRecord>, tx?: Tx): Promise<ShipmentTrackingEventRecord | null> {
    const [row] = await (tx ?? this.db)
      .update(t)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt)))
      .returning();
    return row ?? null;
  }

  /**
   * Decides a date a source proposed - confirmed (applied) or turned down (dismissed) - only while
   * it is still waiting: of two decisions at the same moment one is stored, the other gets null.
   */
  async decideProposal(
    id: string,
    companyId: string,
    decision: { effect: "applied" | "dismissed"; decidedById: string; decidedAt: Date },
  ): Promise<ShipmentTrackingEventRecord | null> {
    const [row] = await this.db
      .update(t)
      .set({ ...decision, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.effect, "proposed"), isNull(t.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Takes back a confirmation `decidedById` made, when the shipment could not take the date: it waits again. */
  async reopenProposal(id: string, companyId: string, decidedById: string): Promise<void> {
    await this.db
      .update(t)
      .set({ effect: "proposed", decidedById: null, decidedAt: null, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.effect, "applied"), eq(t.decidedById, decidedById), isNull(t.deletedAt)));
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
