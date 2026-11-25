import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db/db";
import {
  coLoadingSailingTable as sailings,
  type CoLoadingSailingRecord,
  type NewCoLoadingSailingRecord,
} from "../schemas/coLoadingSailing.schema";
import { coLoadingSailingShipmentTable as links } from "../schemas/coLoadingSailingShipment.schema";
import { coLoadingBoxCostChangeTable as costChanges } from "../schemas/coLoadingBoxCost.schema";
import { cargoDimensionTable as dimensions } from "../schemas/cargoDimension.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { coLoadingBoxCostRepository } from "./coLoadingBoxCost.repository";
import { serviceNameKey } from "./shipment.repository";
import type { BoxShipment } from "../lib/boxUtilization";
import type { SailingDetails, SailingFacts } from "../lib/coLoadingSailing";

/** A change of a sailing that moves its box costs, as the record of changes keeps it (lib/coLoadingBoxCosts sailingDetailChanges). */
export interface SailingChange {
  kind: string;
  oldAmount: number | null;
  newAmount: number | null;
  oldNote: string;
  newNote: string;
}

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

// One of the shipments to link got a live link meanwhile (or, for a move or a removal of several, one was no longer on the sailing): the writes of this call are undone.
class LinkedMeanwhile extends Error {}

/** How a link went: made; refused because a shipment was linked meanwhile (to any sailing); or the sailing is gone. */
export type LinkOutcome = "linked" | "taken" | "gone";

/** How a move went: made; refused because a shipment is no longer on the first sailing; or that sailing is gone. */
export type MoveOutcome = "moved" | "not_on_it" | "gone";

/** A move judged under both sailings' lock: the note the new links keep, or a throw to refuse. */
export type MoveJudge = (from: CoLoadingSailingRecord, to: CoLoadingSailingRecord | null) => string;

/**
 * The live sailings of these ids, held with a lock that a removal of one (removeJudged), an Edit
 * sailing and a save of its box costs wait for - and that waits for them: what is judged under it
 * stays true until the transaction ends. Links and moves take it, so no shipment goes on a sailing
 * removed meanwhile; they do not wait for each other. In the order of the ids, always the same.
 */
const heldLive = (tx: Tx, ids: string[], companyId: string): Promise<CoLoadingSailingRecord[]> =>
  tx
    .select()
    .from(sailings)
    .where(and(inArray(sailings.id, ids), eq(sailings.companyId, companyId), isNull(sailings.deletedAt)))
    .orderBy(asc(sailings.id))
    .for("share");

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
  async shipmentsToLink(shipmentIds: string[], companyId: string): Promise<{ id: string; jobNumber: string; serviceName: string; freightMode: string; loadType: string }[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, serviceName: shipmentTable.serviceName, freightMode: shipmentTable.freightMode, loadType: shipmentTable.loadType })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.id, shipmentIds), isNull(shipmentTable.deletedAt)));
  }

  /** The live sailings these shipments are on now (their live links), with each sailing's vessel and voyage. */
  async sailingsOf(shipmentIds: string[], companyId: string): Promise<{ shipmentId: string; sailingId: string; serviceId: string; vessel: string; voyage: string }[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select({ shipmentId: links.shipmentId, sailingId: links.sailingId, serviceId: sailings.serviceId, vessel: sailings.vessel, voyage: sailings.voyage })
      .from(links)
      .innerJoin(sailings, eq(sailings.id, links.sailingId))
      .where(and(eq(links.companyId, companyId), inArray(links.shipmentId, shipmentIds), isNull(links.deletedAt), eq(sailings.companyId, companyId), isNull(sailings.deletedAt)));
  }

  /**
   * Links the shipments to the sailing, all or none, under the sailing's lock (heldLive). `judge`
   * sees the sailing as it is then and returns the note the links keep - why they still go on a
   * sailing closed for cargo (Council Outlay 14, C3), "" on an open one - or throws to refuse:
   * nothing is linked then. "taken" when one of them was linked meanwhile (to any sailing), which
   * the one live link per shipment refuses; "gone" when the sailing is not found.
   */
  async link(sailingId: string, shipmentIds: string[], companyId: string, by: { id: string; name: string }, judge: (now: CoLoadingSailingRecord) => string): Promise<LinkOutcome> {
    try {
      return await db.transaction(async (tx) => {
        const [now] = await heldLive(tx, [sailingId], companyId);
        if (!now) return "gone";
        const note = judge(now);
        const rows = await tx
          .insert(links)
          .values(shipmentIds.map((shipmentId) => ({ companyId, sailingId, shipmentId, createdById: by.id, createdByName: by.name, linkedNote: note })))
          .onConflictDoNothing()
          .returning({ id: links.id });
        // Thrown to undo the transaction: that is the "none" of all or none.
        if (rows.length !== shipmentIds.length) throw new LinkedMeanwhile();
        return "linked";
      });
    } catch (err) {
      if (err instanceof LinkedMeanwhile) return "taken";
      throw err;
    }
  }

  /**
   * Sets the sailing's stage and records the change, together (Council Outlay 14, C3). The row is
   * locked first; `judge` sees the stage it has then and returns the change to record - null for
   * none - or throws to refuse. The sailing as it is now; null when it is not found.
   */
  async setStageRecorded(id: string, companyId: string, stage: string, by: { id: string; name: string }, judge: (now: string) => SailingChange | null): Promise<CoLoadingSailingRecord | null> {
    return db.transaction(async (tx) => {
      const live = and(eq(sailings.id, id), eq(sailings.companyId, companyId), isNull(sailings.deletedAt));
      const [now] = await tx.select().from(sailings).where(live).for("update");
      if (!now) return null;
      const change = judge(now.stage);
      if (!change) return now;
      const [row] = await tx.update(sailings).set({ stage, updatedAt: new Date() }).where(live).returning();
      await tx.insert(costChanges).values({ companyId, sailingId: id, containerNo: 0, kind: change.kind, oldAmount: null, newAmount: null, oldNote: change.oldNote, newNote: change.newNote, changedById: by.id, changedByName: by.name });
      return row ?? null;
    });
  }

  /**
   * Remembers what each shipment counts in the box now as its figures of the day of linking
   * (Council Outlay 14, C4): only on its live link here, and only where none is remembered yet.
   */
  async rememberLinked(sailingId: string, companyId: string, figures: readonly { shipmentId: string; weightKg: number; volumeCbm: number }[]): Promise<void> {
    for (const f of figures) {
      await db
        .update(links)
        .set({ linkedWeightKg: String(f.weightKg), linkedVolumeCbm: String(f.volumeCbm) })
        .where(and(eq(links.companyId, companyId), eq(links.sailingId, sailingId), eq(links.shipmentId, f.shipmentId), isNull(links.deletedAt), isNull(links.linkedWeightKg)));
    }
  }

  /** A shipment's job number and the people on it, for a notice in its chat; null when it is not found. */
  async peopleOf(shipmentId: string, companyId: string): Promise<{ jobNumber: string; personInCharge: string; holidayCover: string } | null> {
    const [row] = await db
      .select({ jobNumber: shipmentTable.jobNumber, personInCharge: shipmentTable.personInCharge, holidayCover: shipmentTable.holidayCover })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.id, shipmentId), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** The live sailing that has this Master Job as its own, if any: a Master Job belongs to one sailing. */
  async sailingOfMasterJob(masterJobId: string, companyId: string): Promise<CoLoadingSailingRecord | null> {
    const [row] = await db.select().from(sailings).where(and(eq(sailings.companyId, companyId), eq(sailings.masterJobId, masterJobId), isNull(sailings.deletedAt))).limit(1);
    return row ?? null;
  }

  /** Clears the sailing's Master Job and records it in the sailing's changes, together. */
  async clearMasterJob(sailingId: string, companyId: string, was: string, by: { id: string; name: string }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(sailings).set({ masterJobId: null, updatedAt: new Date() }).where(and(eq(sailings.id, sailingId), eq(sailings.companyId, companyId)));
      await tx.insert(costChanges).values({ companyId, sailingId, containerNo: 0, kind: "master_job", oldNote: was, newNote: "", changedById: by.id, changedByName: by.name });
    });
  }

  /**
   * Gives the sailing its Master Job and records it, together, under the sailing's lock (Council
   * Outlay 14, C2). `judge` sees the sailing as it is then and throws to refuse: nothing is made or
   * written then. `masterJob` gives the Master Job to set - for "Create master job" it is made there
   * and then, so of two creates at one moment the second waits, finds the first one's and makes
   * none. The one live sailing per Master Job is the database's (co_loading_sailing_one_master_job):
   * a Master Job another sailing took meanwhile throws its unique violation, and nothing is written.
   * The Master Job set; null when the sailing is not found.
   */
  async setMasterJobJudged<T extends { id: string; mczNumber: string }>(
    sailingId: string,
    companyId: string,
    by: { id: string; name: string },
    judge: (now: CoLoadingSailingRecord) => Promise<void>,
    masterJob: () => Promise<T>,
  ): Promise<T | null> {
    return db.transaction(async (tx) => {
      const live = and(eq(sailings.id, sailingId), eq(sailings.companyId, companyId), isNull(sailings.deletedAt));
      const [now] = await tx.select().from(sailings).where(live).for("update");
      if (!now) return null;
      await judge(now);
      const set = await masterJob();
      await tx.update(sailings).set({ masterJobId: set.id, updatedAt: new Date() }).where(live);
      await tx.insert(costChanges).values({ companyId, sailingId, containerNo: 0, kind: "master_job", oldNote: "", newNote: set.mczNumber, changedById: by.id, changedByName: by.name });
      return set;
    });
  }

  /** Marks whether the people who must act were told that the sailing's box is over its limit. */
  async setOverNotified(sailingId: string, companyId: string, told: boolean): Promise<void> {
    await db.update(sailings).set({ overNotified: told }).where(and(eq(sailings.id, sailingId), eq(sailings.companyId, companyId)));
  }

  /**
   * Claims the telling that the sailing's box is over its limit (Council Outlay 14, C4): sets the
   * mark only where it is not set yet, so of two saves at one moment one tells. False when it was
   * set already - somebody tells, or told - or the sailing is gone.
   */
  async claimOverNotice(sailingId: string, companyId: string): Promise<boolean> {
    const rows = await db
      .update(sailings)
      .set({ overNotified: true })
      .where(and(eq(sailings.id, sailingId), eq(sailings.companyId, companyId), isNull(sailings.deletedAt), eq(sailings.overNotified, false)))
      .returning({ id: sailings.id });
    return rows.length > 0;
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
   * The sailing it left; null when it was on none.
   */
  async dropDeletedShipment(shipmentId: string, companyId: string, by: { id: string | null; name: string }): Promise<string | null> {
    const [row] = await db
      .update(links)
      .set({ deletedAt: new Date(), updatedAt: new Date(), removedById: by.id, removedByName: by.name, removedReason: "shipment_deleted" })
      .where(and(eq(links.companyId, companyId), eq(links.shipmentId, shipmentId), isNull(links.deletedAt)))
      .returning({ sailingId: links.sailingId });
    return row?.sailingId ?? null;
  }

  /**
   * "Edit sailing" in one turn (Council Review 7, K13; Council Outlay 14, A2): sets the sailing's
   * facts (vessel, voyage, ports, HUB, container type), its number of containers, its cut-off and -
   * when given - its departure date, and records every change, together or not at all. The sailing's
   * row is locked first, the lock a save of its box costs takes (coLoadingBoxCost.repository save),
   * so no cost is set between the judging and the writing. `judge` sees the sailing as it is then,
   * with the containers that have a cost a person set (coLoadingBoxCost.repository costedContainers),
   * and returns the changes to record or throws to refuse: nothing is written then. The sailing as
   * it is now; null when it is not found.
   */
  async setDetailsRecorded(
    id: string,
    companyId: string,
    details: SailingDetails,
    by: { id: string; name: string },
    judge: (now: CoLoadingSailingRecord, costedContainers: number[]) => { changes: SailingChange[]; facts: SailingFacts },
  ): Promise<CoLoadingSailingRecord | null> {
    return db.transaction(async (tx) => {
      const live = and(eq(sailings.id, id), eq(sailings.companyId, companyId), isNull(sailings.deletedAt));
      const [now] = await tx.select().from(sailings).where(live).for("update");
      if (!now) return null;
      const { changes, facts } = judge(now, await coLoadingBoxCostRepository.costedContainers(id, companyId, tx));
      const [row] = await tx
        .update(sailings)
        .set({
          ...facts,
          containerCount: details.containerCount,
          cutoffDate: details.cutoffDate,
          ...(details.departureDate !== undefined ? { departureDate: details.departureDate } : {}),
          updatedAt: new Date(),
        })
        .where(live)
        .returning();
      if (changes.length > 0) {
        await tx.insert(costChanges).values(
          changes.map((c) => ({
            companyId,
            sailingId: id,
            // 0: the change is of the sailing, not of one container.
            containerNo: 0,
            kind: c.kind,
            oldAmount: c.oldAmount === null ? null : String(c.oldAmount),
            newAmount: c.newAmount === null ? null : String(c.newAmount),
            oldNote: c.oldNote,
            newNote: c.newNote,
            changedById: by.id,
            changedByName: by.name,
          })),
        );
      }
      return row ?? null;
    });
  }

  /**
   * Removes a sailing made by mistake, under the lock a save of its box costs takes, and that a link
   * or a move waits for (heldLive): nothing goes on it between the judging and the removal. `judge`
   * sees how many live shipments it holds and which containers have a cost a person set, and throws
   * to refuse: nothing is removed then. False when the sailing is not found.
   */
  async removeJudged(id: string, companyId: string, judge: (linkedShipments: number, costedContainers: number[]) => void): Promise<boolean> {
    return db.transaction(async (tx) => {
      const live = and(eq(sailings.id, id), eq(sailings.companyId, companyId), isNull(sailings.deletedAt));
      const [now] = await tx.select({ id: sailings.id }).from(sailings).where(live).for("update");
      if (!now) return false;
      const [linked] = await tx
        .select({ n: count() })
        .from(links)
        .innerJoin(shipmentTable, eq(shipmentTable.id, links.shipmentId))
        .where(and(eq(links.companyId, companyId), eq(links.sailingId, id), isNull(links.deletedAt), isNull(shipmentTable.deletedAt)));
      judge(linked?.n ?? 0, await coLoadingBoxCostRepository.costedContainers(id, companyId, tx));
      const at = new Date();
      await tx.update(sailings).set({ deletedAt: at, updatedAt: at }).where(live);
      return true;
    });
  }

  /** The sailing a shipment is on now (its live link to a live sailing), or null. */
  async sailingOfShipment(shipmentId: string, companyId: string): Promise<CoLoadingSailingRecord | null> {
    const [row] = await db
      .select({ sailing: sailings })
      .from(links)
      .innerJoin(sailings, eq(sailings.id, links.sailingId))
      .where(and(eq(links.companyId, companyId), eq(links.shipmentId, shipmentId), isNull(links.deletedAt), isNull(sailings.deletedAt)))
      .limit(1);
    return row?.sailing ?? null;
  }

  /**
   * The sailings of these services still to come: no departure date yet, or one of `today` or
   * later, and not set to Departed or a later stage by hand. The soonest first, the undated ones last.
   */
  async comingOfServices(serviceIds: string[], companyId: string, today: string): Promise<CoLoadingSailingRecord[]> {
    if (serviceIds.length === 0) return [];
    return db
      .select()
      .from(sailings)
      .where(and(eq(sailings.companyId, companyId), inArray(sailings.serviceId, serviceIds), isNull(sailings.deletedAt), or(isNull(sailings.departureDate), gte(sailings.departureDate, today)), inArray(sailings.stage, ["open", "closed"])))
      .orderBy(asc(sailings.departureDate), asc(sailings.createdAt))
      .limit(200);
  }

  /** Every live sailing of these services, the newest first: what the main search looks through. */
  async listOfServices(serviceIds: string[], companyId: string): Promise<CoLoadingSailingRecord[]> {
    if (serviceIds.length === 0) return [];
    return db
      .select()
      .from(sailings)
      .where(and(eq(sailings.companyId, companyId), inArray(sailings.serviceId, serviceIds), isNull(sailings.deletedAt)))
      .orderBy(desc(sailings.createdAt))
      .limit(2000);
  }

  /**
   * The company's live shipments on no sailing, counted by Service Name - read as a service's page
   * reads it (shipment.repository serviceNameKey) - mode and load type: what each service's waiting
   * shipments are worked out from. A cancelled shipment waits for no box; one with no Service Name
   * belongs to no service.
   */
  async waitingByKind(companyId: string, cancelledStatus: string): Promise<{ serviceName: string; freightMode: string; loadType: string; shipments: number }[]> {
    const name = sql<string>`${serviceNameKey()}`;
    return db
      .select({ serviceName: name, freightMode: shipmentTable.freightMode, loadType: shipmentTable.loadType, shipments: count() })
      .from(shipmentTable)
      .where(
        and(
          eq(shipmentTable.companyId, companyId),
          isNull(shipmentTable.deletedAt),
          ne(shipmentTable.status, cancelledStatus),
          sql`${name} <> ''`,
          sql`NOT EXISTS (SELECT 1 FROM ${links} WHERE ${links.shipmentId} = ${shipmentTable.id} AND ${links.companyId} = ${shipmentTable.companyId} AND ${links.deletedAt} IS NULL)`,
        ),
      )
      // Grouped by the first column's position: the key's characters to trim go as a parameter, so
      // the same expression written again in GROUP BY would carry another one, and Postgres refuses it.
      .groupBy(sql`1`, shipmentTable.freightMode, shipmentTable.loadType);
  }

  /** Moves the shipment from one sailing to another in one turn: moveMany of one. */
  async move(fromSailingId: string, toSailingId: string, shipmentId: string, companyId: string, by: { id: string; name: string }, note: string, judge: MoveJudge): Promise<MoveOutcome> {
    return this.moveMany(fromSailingId, toSailingId, [shipmentId], companyId, by, note, judge);
  }

  /**
   * Moves several shipments from one sailing to another in one turn, all or none (Council Outlay 14,
   * A9): each link here is taken off, saying where it went and why, and each is linked there. Both
   * sailings are held first (heldLive): `judge` sees them as they are then - the target null when it
   * is gone - and returns the note the new links keep (why they still go on a sailing closed for
   * cargo) or throws to refuse: nothing is written then. "not_on_it", with nothing written, when one
   * of them is not on the first sailing; "gone" when the first sailing is not found.
   */
  async moveMany(fromSailingId: string, toSailingId: string, shipmentIds: string[], companyId: string, by: { id: string; name: string }, note: string, judge: MoveJudge): Promise<MoveOutcome> {
    try {
      return await db.transaction(async (tx) => {
        const held = await heldLive(tx, [fromSailingId, toSailingId], companyId);
        const from = held.find((r) => r.id === fromSailingId);
        if (!from) return "gone";
        const linkedNote = judge(from, held.find((r) => r.id === toSailingId) ?? null);
        const now = new Date();
        const off = await tx
          .update(links)
          .set({ deletedAt: now, updatedAt: now, removedById: by.id, removedByName: by.name, removedReason: "moved", movedToSailingId: toSailingId, removedNote: note })
          .where(and(eq(links.companyId, companyId), eq(links.sailingId, fromSailingId), inArray(links.shipmentId, shipmentIds), isNull(links.deletedAt)))
          .returning({ id: links.id });
        // Thrown to undo the transaction: that is the "none" of all or none.
        if (off.length !== shipmentIds.length) throw new LinkedMeanwhile();
        await tx.insert(links).values(shipmentIds.map((shipmentId) => ({ companyId, sailingId: toSailingId, shipmentId, createdById: by.id, createdByName: by.name, linkedNote })));
        return "moved";
      });
    } catch (err) {
      if (err instanceof LinkedMeanwhile) return "not_on_it";
      throw err;
    }
  }

  /** Takes several shipments off the sailing in one turn, all or none, recording who did; false when one of them was not on it. */
  async unlinkMany(sailingId: string, shipmentIds: string[], companyId: string, by: { id: string; name: string }): Promise<boolean> {
    try {
      await db.transaction(async (tx) => {
        const off = await tx
          .update(links)
          .set({ deletedAt: new Date(), updatedAt: new Date(), removedById: by.id, removedByName: by.name, removedReason: "removed" })
          .where(and(eq(links.companyId, companyId), eq(links.sailingId, sailingId), inArray(links.shipmentId, shipmentIds), isNull(links.deletedAt)))
          .returning({ id: links.id });
        if (off.length !== shipmentIds.length) throw new LinkedMeanwhile();
      });
      return true;
    } catch (err) {
      if (err instanceof LinkedMeanwhile) return false;
      throw err;
    }
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
        linkedNote: links.linkedNote,
        linkedWeightKg: links.linkedWeightKg,
        linkedVolumeCbm: links.linkedVolumeCbm,
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
        // The dangerous goods a line names, for the box's dangerous-cargo card.
        adrUn: dimensions.adrUn,
        adrClass: dimensions.adrClass,
        // What the line is called in a plan of the box.
        packageType: dimensions.packageType,
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

  /** The sailing's live shipments with the facts a sailing shares with them: vessel, voyage, dates and ports. By job number. */
  async shipmentFacts(sailingId: string, companyId: string) {
    return db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        status: shipmentTable.status,
        masterJobId: shipmentTable.masterJobId,
        vessel: shipmentTable.vessel,
        voyage: shipmentTable.voyage,
        estimatedDeparture: shipmentTable.estimatedDeparture,
        closingDate: shipmentTable.closingDate,
        actualDeparture: shipmentTable.actualDeparture,
        pol: shipmentTable.pol,
        pod: shipmentTable.pod,
      })
      .from(links)
      .innerJoin(shipmentTable, eq(shipmentTable.id, links.shipmentId))
      .where(and(eq(links.companyId, companyId), eq(links.sailingId, sailingId), isNull(links.deletedAt), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))
      .orderBy(asc(shipmentTable.jobNumber));
  }

  async create(values: NewCoLoadingSailingRecord): Promise<CoLoadingSailingRecord> {
    const [row] = await db.insert(sailings).values(values).returning();
    return row!;
  }
}

export const coLoadingSailingRepository = new CoLoadingSailingRepository();
