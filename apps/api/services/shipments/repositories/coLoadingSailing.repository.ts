import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import {
  coLoadingSailingTable as sailings,
  type CoLoadingSailingRecord,
  type NewCoLoadingSailingRecord,
} from "../schemas/coLoadingSailing.schema";
import { coLoadingSailingShipmentTable as links } from "../schemas/coLoadingSailingShipment.schema";
import { cargoDimensionTable as dimensions } from "../schemas/cargoDimension.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import type { BoxShipment } from "../lib/boxUtilization";

/** A linked shipment as stored: what the box's fill reads, and what kind of shipment it is. */
export type LinkedCargo = Omit<BoxShipment, "cancelled" | "odd"> & {
  freightMode: string;
  loadType: string;
  tradeDirection: string;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
  actualArrival: string | null;
  actualDeparture: string | null;
  masterJobId: string | null;
};

// One of the shipments to link got a live link meanwhile: the links of this call are undone.
class LinkedMeanwhile extends Error {}

// A Co-Loading Concept service's sailings (lib/coLoadingSailing), always read within one company.
class CoLoadingSailingRepository {
  /** The service's live sailings, the newest first. */
  async listByService(serviceId: string, companyId: string): Promise<CoLoadingSailingRecord[]> {
    return db
      .select()
      .from(sailings)
      .where(and(eq(sailings.companyId, companyId), eq(sailings.serviceId, serviceId), isNull(sailings.deletedAt)))
      .orderBy(desc(sailings.createdAt), desc(sailings.id));
  }

  async get(id: string, companyId: string): Promise<CoLoadingSailingRecord | null> {
    const [row] = await db
      .select()
      .from(sailings)
      .where(and(eq(sailings.id, id), eq(sailings.companyId, companyId), isNull(sailings.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** The company's live shipments of these ids, as linking judges them: reference and Service Name. */
  async shipmentsToLink(shipmentIds: string[], companyId: string): Promise<{ id: string; jobNumber: string; serviceName: string }[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, serviceName: shipmentTable.serviceName })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.id, shipmentIds), isNull(shipmentTable.deletedAt)));
  }

  /** The sailings these shipments are on now (their live links), with each sailing's vessel and voyage. */
  async sailingsOf(shipmentIds: string[], companyId: string): Promise<{ shipmentId: string; sailingId: string; vessel: string; voyage: string }[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select({ shipmentId: links.shipmentId, sailingId: links.sailingId, vessel: sailings.vessel, voyage: sailings.voyage })
      .from(links)
      .innerJoin(sailings, eq(sailings.id, links.sailingId))
      .where(and(eq(links.companyId, companyId), inArray(links.shipmentId, shipmentIds), isNull(links.deletedAt)));
  }

  /**
   * Links the shipments to the sailing, all or none: false when one of them was linked meanwhile (to
   * any sailing), which the one live link per shipment refuses.
   */
  async link(sailingId: string, shipmentIds: string[], companyId: string, by: { id: string; name: string }): Promise<boolean> {
    try {
      await db.transaction(async (tx) => {
        const rows = await tx
          .insert(links)
          .values(shipmentIds.map((shipmentId) => ({ companyId, sailingId, shipmentId, createdById: by.id, createdByName: by.name })))
          .onConflictDoNothing()
          .returning({ id: links.id });
        // Thrown to undo the transaction: that is the "none" of all or none.
        if (rows.length !== shipmentIds.length) throw new LinkedMeanwhile();
      });
      return true;
    } catch (err) {
      if (err instanceof LinkedMeanwhile) return false;
      throw err;
    }
  }

  /** Takes the shipment off the sailing, recording who did; false when it was not on it. */
  async unlink(sailingId: string, shipmentId: string, companyId: string, by: { id: string; name: string }): Promise<boolean> {
    const rows = await db
      .update(links)
      .set({ deletedAt: new Date(), updatedAt: new Date(), removedById: by.id, removedByName: by.name, removedReason: "removed" })
      .where(and(eq(links.companyId, companyId), eq(links.sailingId, sailingId), eq(links.shipmentId, shipmentId), isNull(links.deletedAt)))
      .returning({ id: links.id });
    return rows.length > 0;
  }

  /**
   * A deleted shipment leaves its box: its live link, if it has one, is taken off and says why.
   * Returns how many links went (0 or 1).
   */
  async dropDeletedShipment(shipmentId: string, companyId: string, by: { id: string | null; name: string }): Promise<number> {
    const rows = await db
      .update(links)
      .set({ deletedAt: new Date(), updatedAt: new Date(), removedById: by.id, removedByName: by.name, removedReason: "shipment_deleted" })
      .where(and(eq(links.companyId, companyId), eq(links.shipmentId, shipmentId), isNull(links.deletedAt)))
      .returning({ id: links.id });
    return rows.length;
  }

  /** Sets the sailing's number of containers, its cut-off and - when given - its departure date; the sailing as it is now, null when not found. */
  async setDetails(id: string, companyId: string, details: { containerCount: number; cutoffDate: string | null; departureDate?: string | null }): Promise<CoLoadingSailingRecord | null> {
    const [row] = await db
      .update(sailings)
      .set({ ...details, updatedAt: new Date() })
      .where(and(eq(sailings.id, id), eq(sailings.companyId, companyId), isNull(sailings.deletedAt)))
      .returning();
    return row ?? null;
  }

  /**
   * Moves the shipment from one sailing to another in one turn: its link here is taken off, saying
   * where it went and why, and it is linked there. False when it was not on the first sailing.
   */
  async move(fromSailingId: string, toSailingId: string, shipmentId: string, companyId: string, by: { id: string; name: string }, note: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const off = await tx
        .update(links)
        .set({ deletedAt: now, updatedAt: now, removedById: by.id, removedByName: by.name, removedReason: "moved", movedToSailingId: toSailingId, removedNote: note })
        .where(and(eq(links.companyId, companyId), eq(links.sailingId, fromSailingId), eq(links.shipmentId, shipmentId), isNull(links.deletedAt)))
        .returning({ id: links.id });
      if (off.length === 0) return false;
      await tx.insert(links).values({ companyId, sailingId: toSailingId, shipmentId, createdById: by.id, createdByName: by.name });
      return true;
    });
  }

  /** The shipments taken off the sailing, the last one first: its history of removals. A deleted shipment is named too. */
  async removedFrom(sailingId: string, companyId: string) {
    const movedTo = alias(sailings, "moved_to");
    return db
      .select({
        note: links.removedNote,
        movedToVessel: movedTo.vessel,
        movedToVoyage: movedTo.voyage,
        shipmentId: links.shipmentId,
        jobNumber: shipmentTable.jobNumber,
        customer: shipmentTable.customer,
        removedAt: links.deletedAt,
        removedByName: links.removedByName,
        reason: links.removedReason,
        linkedByName: links.createdByName,
        linkedAt: links.createdAt,
      })
      .from(links)
      .innerJoin(shipmentTable, eq(shipmentTable.id, links.shipmentId))
      .leftJoin(movedTo, eq(movedTo.id, links.movedToSailingId))
      .where(and(eq(links.companyId, companyId), eq(links.sailingId, sailingId), isNotNull(links.deletedAt), eq(shipmentTable.companyId, companyId)))
      .orderBy(desc(links.deletedAt))
      .limit(200);
  }

  /**
   * The shipments in the sailing's box - its live links to live shipments - with the cargo figures
   * the box's fill is worked out from. Two reads whatever the number of shipments.
   */
  async boxShipments(sailingId: string, companyId: string): Promise<LinkedCargo[]> {
    return (await this.boxShipmentsOf([sailingId], companyId)).get(sailingId) ?? [];
  }

  /** The same for several sailings at once, by sailing: two reads whatever the number of sailings. */
  async boxShipmentsOf(sailingIds: string[], companyId: string): Promise<Map<string, LinkedCargo[]>> {
    const bySailing = new Map<string, LinkedCargo[]>();
    if (sailingIds.length === 0) return bySailing;
    const rows = await db
      .select({
        sailingId: links.sailingId,
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customer: shipmentTable.customer,
        status: shipmentTable.status,
        freightMode: shipmentTable.freightMode,
        loadType: shipmentTable.loadType,
        // What chooses the ČNB rates its money is valued at, and whether a master job shares costs into it (Earnings).
        tradeDirection: shipmentTable.tradeDirection,
        estimatedArrival: shipmentTable.estimatedArrival,
        estimatedDeparture: shipmentTable.estimatedDeparture,
        actualArrival: shipmentTable.actualArrival,
        actualDeparture: shipmentTable.actualDeparture,
        masterJobId: shipmentTable.masterJobId,
        dangerous: shipmentTable.dangerous,
        outOfGauge: shipmentTable.outOfGauge,
        temperatureControlled: shipmentTable.temperatureControlled,
        pcs: shipmentTable.pcs,
        totalWeightTons: shipmentTable.totalWeightTons,
        totalVolumeCbm: shipmentTable.totalVolumeCbm,
      })
      .from(links)
      .innerJoin(shipmentTable, eq(shipmentTable.id, links.shipmentId))
      .where(and(eq(links.companyId, companyId), inArray(links.sailingId, sailingIds), isNull(links.deletedAt), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)));
    if (rows.length === 0) return bySailing;
    const lines = await db
      .select({
        shipmentId: dimensions.shipmentId,
        pieces: dimensions.pieces,
        lengthCm: dimensions.lengthCm,
        widthCm: dimensions.widthCm,
        heightCm: dimensions.heightCm,
        weightPerPcKg: dimensions.weightPerPcKg,
        volumePerPcM3: dimensions.volumePerPcM3,
        stackable: dimensions.stackable,
      })
      .from(dimensions)
      .where(and(eq(dimensions.companyId, companyId), inArray(dimensions.shipmentId, rows.map((r) => r.id)), isNull(dimensions.deletedAt)))
      .orderBy(asc(dimensions.shipmentId), asc(dimensions.position));
    const byShipment = new Map<string, BoxShipment["cargoDimensions"]>();
    for (const { shipmentId, ...line } of lines) {
      const list = byShipment.get(shipmentId);
      if (list) list.push(line);
      else byShipment.set(shipmentId, [line]);
    }
    for (const { sailingId, ...r } of rows) {
      const shipment = { ...r, cargoDimensions: byShipment.get(r.id) ?? [] };
      const list = bySailing.get(sailingId);
      if (list) list.push(shipment);
      else bySailing.set(sailingId, [shipment]);
    }
    return bySailing;
  }

  async create(values: NewCoLoadingSailingRecord): Promise<CoLoadingSailingRecord> {
    const [row] = await db.insert(sailings).values(values).returning();
    return row!;
  }
}

export const coLoadingSailingRepository = new CoLoadingSailingRepository();
