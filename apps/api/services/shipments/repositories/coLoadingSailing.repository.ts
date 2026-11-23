import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
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

  /** Takes the shipment off the sailing; false when it was not on it. */
  async unlink(sailingId: string, shipmentId: string, companyId: string): Promise<boolean> {
    const rows = await db
      .update(links)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(links.companyId, companyId), eq(links.sailingId, sailingId), eq(links.shipmentId, shipmentId), isNull(links.deletedAt)))
      .returning({ id: links.id });
    return rows.length > 0;
  }

  /**
   * The shipments in the sailing's box - its live links to live shipments - with the cargo figures
   * the box's fill is worked out from. Two reads whatever the number of shipments.
   */
  async boxShipments(sailingId: string, companyId: string): Promise<Omit<BoxShipment, "cancelled">[]> {
    return (await this.boxShipmentsOf([sailingId], companyId)).get(sailingId) ?? [];
  }

  /** The same for several sailings at once, by sailing: two reads whatever the number of sailings. */
  async boxShipmentsOf(sailingIds: string[], companyId: string): Promise<Map<string, Omit<BoxShipment, "cancelled">[]>> {
    const bySailing = new Map<string, Omit<BoxShipment, "cancelled">[]>();
    if (sailingIds.length === 0) return bySailing;
    const rows = await db
      .select({
        sailingId: links.sailingId,
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customer: shipmentTable.customer,
        status: shipmentTable.status,
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
