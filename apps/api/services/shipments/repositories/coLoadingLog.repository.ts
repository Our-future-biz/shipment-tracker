import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { coLoadingBoxCostChangeTable as changes } from "../schemas/coLoadingBoxCost.schema";
import { coLoadingSailingTable as sailings, type CoLoadingSailingRecord } from "../schemas/coLoadingSailing.schema";
import { coLoadingSailingCheckTable as checks, type CoLoadingSailingCheckRecord } from "../schemas/coLoadingSailingCheck.schema";
import { coLoadingSailingShipmentTable as links } from "../schemas/coLoadingSailingShipment.schema";
import { shipmentTable } from "../schemas/shipment.schema";

// A sailing's checklist ticks, its hand-over note and what its history is read from (Council Outlay
// 14, C5). Every statement names the company. A tick and a note are written together with their
// line in the sailing's record of changes, or not at all.
export const coLoadingLogRepository = {
  async ticks(sailingId: string, companyId: string): Promise<CoLoadingSailingCheckRecord[]> {
    return db.select().from(checks).where(and(eq(checks.companyId, companyId), eq(checks.sailingId, sailingId))).orderBy(asc(checks.doneAt));
  },

  /** Ticks or unticks a step, and records it; false when it already stood that way (nothing is written). */
  async setTick(sailingId: string, companyId: string, step: string, done: boolean, by: { id: string; name: string }): Promise<boolean> {
    return db.transaction(async (tx) => {
      const one = and(eq(checks.companyId, companyId), eq(checks.sailingId, sailingId), eq(checks.step, step));
      const changed = done
        ? await tx.insert(checks).values({ companyId, sailingId, step, doneById: by.id, doneByName: by.name }).onConflictDoNothing().returning({ id: checks.id })
        : await tx.delete(checks).where(one).returning({ id: checks.id });
      if (changed.length === 0) return false;
      await tx.insert(changes).values({ companyId, sailingId, containerNo: 0, kind: "check", oldNote: done ? "" : step, newNote: done ? step : "", changedById: by.id, changedByName: by.name });
      return true;
    });
  },

  /** Writes the hand-over note and records that it changed; the sailing as it is now, null when it is not found. A note that is the same writes nothing. */
  async setNote(sailingId: string, companyId: string, note: string, by: { id: string; name: string }): Promise<CoLoadingSailingRecord | null> {
    return db.transaction(async (tx) => {
      const live = and(eq(sailings.id, sailingId), eq(sailings.companyId, companyId), isNull(sailings.deletedAt));
      const [now] = await tx.select().from(sailings).where(live).for("update");
      if (!now) return null;
      if (now.note === note) return now;
      const [row] = await tx.update(sailings).set({ note, noteByName: by.name, noteAt: new Date(), updatedAt: new Date() }).where(live).returning();
      await tx.insert(changes).values({ companyId, sailingId, containerNo: 0, kind: "note", oldNote: now.note, newNote: note, changedById: by.id, changedByName: by.name });
      return row ?? null;
    });
  },

  /** The kept changes of the sailing itself (not of a container's costs), the latest first. */
  async sailingChanges(sailingId: string, companyId: string) {
    return db
      .select()
      .from(changes)
      .where(and(eq(changes.companyId, companyId), eq(changes.sailingId, sailingId), eq(changes.containerNo, 0)))
      .orderBy(desc(changes.changedAt))
      .limit(500);
  },

  /** Every link the sailing ever had, live or taken off, with the shipment's job number - a deleted shipment's too - and where a moved one went. */
  async historyLinks(sailingId: string, companyId: string) {
    const movedTo = alias(sailings, "moved_to");
    return db
      .select({
        jobNumber: shipmentTable.jobNumber,
        linkedAt: links.createdAt,
        linkedByName: links.createdByName,
        linkedNote: links.linkedNote,
        removedAt: links.deletedAt,
        removedByName: links.removedByName,
        removedReason: links.removedReason,
        removedNote: links.removedNote,
        movedToVessel: movedTo.vessel,
        movedToVoyage: movedTo.voyage,
      })
      .from(links)
      .innerJoin(shipmentTable, eq(shipmentTable.id, links.shipmentId))
      .leftJoin(movedTo, eq(movedTo.id, links.movedToSailingId))
      .where(and(eq(links.companyId, companyId), eq(links.sailingId, sailingId), eq(shipmentTable.companyId, companyId)))
      .orderBy(desc(links.createdAt))
      .limit(500);
  },
};
