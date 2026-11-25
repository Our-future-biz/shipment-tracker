import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "../../db/db";
import { coLoadingLogRepository as repo, NoteChangedMeanwhile } from "../../repositories/coLoadingLog.repository";
import { coLoadingSailingRepository } from "../../repositories/coLoadingSailing.repository";
import { coLoadingBoxCostChangeTable as changes } from "../../schemas/coLoadingBoxCost.schema";
import { coLoadingSailingTable as sailings } from "../../schemas/coLoadingSailing.schema";
import { shipmentTable } from "../../schemas/shipment.schema";

// The SQL a sailing's checklist, hand-over note and history rely on (migration 0105), against the
// shipments database (Council Outlay 14, C5, C6): a tick matched whatever its case, written with its
// line in the record or not at all; a note not written over a colleague's unseen; and the links the
// customer notices and the history are read from. Every row belongs to the test's own company. Runs
// only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const JANA = { id: randomUUID(), name: "Jana Nová" };
const EVA = { id: randomUUID(), name: "Eva Malá" };

const newSailing = async (companyId: string, more: Partial<typeof sailings.$inferInsert> = {}) => {
  const [row] = await db
    .insert(sailings)
    .values({ companyId, serviceId: randomUUID(), vessel: "WEEK 51", voyage: "", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC", ...more })
    .returning();
  return row!;
};
const newShipment = async (companyId: string, jobNumber: string, customer = "") => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber, customer, tradeDirection: "Import" }).returning();
  return row!;
};
const sailingRow = async (id: string) => (await db.select().from(sailings).where(eq(sailings.id, id)))[0]!;
const open = () => "";

describe("a sailing's checklist", () => {
  it("ticks a step once whatever its case, and unticks it by the words a manager re-cased it to", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    expect(await repo.setTick(s.id, companyId, "B/L received", true, JANA)).toBe(true);
    // Ticked already, in another case: no second tick.
    expect(await repo.setTick(s.id, companyId, "b/l RECEIVED", true, EVA)).toBe(false);
    expect((await repo.ticks(s.id, companyId)).map((t) => [t.step, t.doneByName])).toEqual([["B/L received", "Jana Nová"]]);
    // The company's list now says "B/L Received".
    expect(await repo.setTick(s.id, companyId, "B/L Received", false, EVA)).toBe(true);
    expect(await repo.ticks(s.id, companyId)).toEqual([]);
    expect(await repo.setTick(s.id, companyId, "B/L Received", false, EVA)).toBe(false);
    expect((await repo.sailingChanges(s.id, companyId)).map((c) => [c.kind, c.oldNote, c.newNote, c.changedByName]).sort()).toEqual([
      ["check", "", "B/L received", "Jana Nová"],
      ["check", "B/L Received", "", "Eva Malá"],
    ]);
  });

  it("of two ticks of one step in two casings at one moment keeps one", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    const both = await Promise.all([repo.setTick(s.id, companyId, "Pre-alert", true, JANA), repo.setTick(s.id, companyId, "PRE-ALERT", true, EVA)]);
    expect(both.sort()).toEqual([false, true]);
    expect(await repo.ticks(s.id, companyId)).toHaveLength(1);
    expect(await repo.sailingChanges(s.id, companyId)).toHaveLength(1);
  });

  it("ticks nothing on another company's sailing, nor on one removed", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    expect(await repo.setTick(s.id, randomUUID(), "Pre-alert", true, JANA)).toBe(false);
    await repo.setTick(s.id, companyId, "Pre-alert", true, JANA);
    expect(await repo.setTick(s.id, randomUUID(), "Pre-alert", false, JANA)).toBe(false);
    expect(await repo.ticks(s.id, companyId)).toHaveLength(1);
    await coLoadingSailingRepository.removeJudged(s.id, companyId, () => undefined);
    expect(await repo.setTick(s.id, companyId, "Booking confirmed", true, JANA)).toBe(false);
  });
});

describe("a sailing's hand-over note", () => {
  it("is written with its line in the record, and a note that is the same writes nothing", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    expect(await repo.setNote(s.id, companyId, "Call the warehouse", null, JANA)).toMatchObject({ note: "Call the warehouse", noteByName: "Jana Nová" });
    expect(await repo.setNote(s.id, companyId, "Call the warehouse", "something else", EVA)).toMatchObject({ noteByName: "Jana Nová" });
    expect((await repo.sailingChanges(s.id, companyId)).map((c) => [c.kind, c.oldNote, c.newNote])).toEqual([["note", "", "Call the warehouse"]]);
    expect(await repo.setNote(s.id, randomUUID(), "x", null, EVA)).toBeNull();
  });

  it("is not written over a note a colleague changed since the screen read it: who changed it is named, nothing is written", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.setNote(s.id, companyId, "First", "", JANA);
    await repo.setNote(s.id, companyId, "Second", "First", EVA);
    const stale = repo.setNote(s.id, companyId, "Mine", "First", JANA);
    await expect(stale).rejects.toBeInstanceOf(NoteChangedMeanwhile);
    await expect(stale).rejects.toMatchObject({ by: "Eva Malá" });
    expect((await sailingRow(s.id)).note).toBe("Second");
    expect(await repo.sailingChanges(s.id, companyId)).toHaveLength(2);
  });

  it("of two saves at one moment over the same note writes one: the second waits for the lock and sees the first", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    const both = await Promise.allSettled([repo.setNote(s.id, companyId, "Jana's", "", JANA), repo.setNote(s.id, companyId, "Eva's", "", EVA)]);
    expect(both.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(both.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(NoteChangedMeanwhile) });
    expect(await repo.sailingChanges(s.id, companyId)).toHaveLength(1);
  });
});

describe("what a sailing's customer notices and history are read from", () => {
  it("gives the notices the shipments on it and those moved on, with where they went - never a deleted shipment - and the history every link", async () => {
    const companyId = randomUUID();
    const [x, y] = [await newSailing(companyId), await newSailing(companyId, { vessel: "MSC Anna", voyage: "445W" })];
    const [a, b, c] = [await newShipment(companyId, "CZLCL1", "Alfa"), await newShipment(companyId, "CZLCL2", "Beta"), await newShipment(companyId, "CZLCL3", "Gama")];
    await coLoadingSailingRepository.link(x.id, [a.id, b.id, c.id], companyId, JANA, open);
    await coLoadingSailingRepository.move(x.id, y.id, b.id, companyId, EVA, "Box full", open);
    await db.update(shipmentTable).set({ deletedAt: new Date() }).where(eq(shipmentTable.id, c.id));
    await coLoadingSailingRepository.dropDeletedShipment(c.id, companyId, { id: JANA.id, name: JANA.name });

    const notices = await repo.noticeLinks(x.id, companyId);
    expect(notices.map((n) => [n.jobNumber, n.customer, n.removedReason, n.removedNote, n.movedToVessel])).toEqual([
      ["CZLCL1", "Alfa", "", "", null],
      ["CZLCL2", "Beta", "moved", "Box full", "MSC Anna"],
    ]);
    expect(await repo.noticeLinks(x.id, randomUUID())).toEqual([]);

    const history = await repo.historyLinks(x.id, companyId);
    expect(history.map((h) => [h.jobNumber, h.removedReason, h.removedByName]).sort()).toEqual([
      ["CZLCL1", "", ""],
      ["CZLCL2", "moved", "Eva Malá"],
      ["CZLCL3", "shipment_deleted", "Jana Nová"],
    ]);
    expect(await repo.historyLinks(x.id, randomUUID())).toEqual([]);
  });

  it("gives the history the changes of the sailing itself, never a container's box costs", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await db.insert(changes).values([
      { companyId, sailingId: s.id, containerNo: 0, kind: "stage", oldNote: "Open", newNote: "Departed", changedByName: "Eva Malá" },
      { companyId, sailingId: s.id, containerNo: 1, kind: "ocean", oldAmount: null, newAmount: "1000.00", changedByName: "Eva Malá" },
    ]);
    expect((await repo.sailingChanges(s.id, companyId)).map((c) => [c.containerNo, c.kind])).toEqual([[0, "stage"]]);
    expect(await repo.sailingChanges(s.id, randomUUID())).toEqual([]);
  });
});
