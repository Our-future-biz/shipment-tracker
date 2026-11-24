import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../../db/db";
import { coLoadingSailingRepository as repo } from "../../repositories/coLoadingSailing.repository";
import { coLoadingBoxCostChangeTable as changes, coLoadingBoxCostTable as costs } from "../../schemas/coLoadingBoxCost.schema";
import { coLoadingSailingTable as sailings, type CoLoadingSailingRecord } from "../../schemas/coLoadingSailing.schema";
import { coLoadingSailingShipmentTable as links } from "../../schemas/coLoadingSailingShipment.schema";

// The SQL a sailing's box and Edit sailing rely on (migrations 0098-0103), against the shipments
// database: linking all or none under the one live link per shipment, a move that says where the
// shipment went and why, taking a shipment off by hand or because it was deleted, and Edit sailing
// written with its record of changes under the sailing's lock. Every row belongs to the test's own
// company. Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const JANA = { id: randomUUID(), name: "Jana Nová" };
const EVA = { id: randomUUID(), name: "Eva Malá" };

const newSailing = async (companyId: string, more: Partial<typeof sailings.$inferInsert> = {}) => {
  const [row] = await db
    .insert(sailings)
    .values({ companyId, serviceId: randomUUID(), vessel: "WEEK 51", voyage: "", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC", ...more })
    .returning();
  return row!;
};
const linksOf = (companyId: string) => db.select().from(links).where(eq(links.companyId, companyId)).orderBy(asc(links.createdAt), asc(links.id));
const live = async (companyId: string) => (await linksOf(companyId)).filter((l) => l.deletedAt === null).map((l) => [l.sailingId, l.shipmentId]);
const recordOf = (sailingId: string, companyId: string) =>
  db.select().from(changes).where(and(eq(changes.companyId, companyId), eq(changes.sailingId, sailingId))).orderBy(asc(changes.kind));
const sailingRow = async (id: string) => (await db.select().from(sailings).where(eq(sailings.id, id)))[0]!;

describe("linking shipments to a sailing", () => {
  it("links all of them, or none when one is on a sailing already", async () => {
    const companyId = randomUUID();
    const [x, y] = [randomUUID(), randomUUID()];
    const [s1, s2, s3] = [randomUUID(), randomUUID(), randomUUID()];
    expect(await repo.link(x, [s2], companyId, JANA)).toBe(true);
    // s2 is on x: linking s1 and s2 to y links neither.
    expect(await repo.link(y, [s1, s2], companyId, EVA)).toBe(false);
    expect(await live(companyId)).toEqual([[x, s2]]);
    expect(await repo.link(y, [s1, s3], companyId, EVA)).toBe(true);
    expect((await live(companyId)).sort()).toEqual([[x, s2], [y, s1], [y, s3]].sort());
    expect((await linksOf(companyId)).find((l) => l.shipmentId === s1)).toMatchObject({ createdById: EVA.id, createdByName: "Eva Malá" });
  });

  it("keeps one company's links from another's: the same shipment id is free in another company", async () => {
    const [companyId, other] = [randomUUID(), randomUUID()];
    const [x, y] = [randomUUID(), randomUUID()];
    const shipment = randomUUID();
    expect(await repo.link(x, [shipment], companyId, JANA)).toBe(true);
    expect(await repo.link(y, [shipment], other, JANA)).toBe(true);
    // The other company takes nothing of this one's off, though it names the sailing and the shipment.
    expect(await repo.unlink(x, shipment, other, JANA)).toBe(false);
    expect(await repo.dropDeletedShipment(shipment, other, { id: JANA.id, name: JANA.name })).toBe(1);
    expect(await live(companyId)).toEqual([[x, shipment]]);
  });
});

describe("moving a shipment to another sailing", () => {
  it("takes it off the first, saying where it went and why, and links it to the second, in one turn", async () => {
    const companyId = randomUUID();
    const [x, y] = [randomUUID(), randomUUID()];
    const shipment = randomUUID();
    await repo.link(x, [shipment], companyId, JANA);
    expect(await repo.move(x, y, shipment, companyId, EVA, "Box full, rolled to next week")).toBe(true);
    const [left, now] = await linksOf(companyId);
    expect(left).toMatchObject({ sailingId: x, removedReason: "moved", movedToSailingId: y, removedNote: "Box full, rolled to next week", removedById: EVA.id, removedByName: "Eva Malá" });
    expect(left!.deletedAt).not.toBeNull();
    expect(now).toMatchObject({ sailingId: y, shipmentId: shipment, deletedAt: null, createdByName: "Eva Malá" });
    // It is no longer on the first sailing: moving it from there again finds nothing, and writes nothing.
    expect(await repo.move(x, y, shipment, companyId, EVA, "again")).toBe(false);
    expect(await linksOf(companyId)).toHaveLength(2);
  });
});

describe("taking a shipment off a sailing", () => {
  it("by hand records who did it; it can then be linked again, and a deleted shipment leaves its box saying why", async () => {
    const companyId = randomUUID();
    const [x, y] = [randomUUID(), randomUUID()];
    const shipment = randomUUID();
    await repo.link(x, [shipment], companyId, JANA);
    expect(await repo.unlink(x, shipment, companyId, EVA)).toBe(true);
    expect(await repo.unlink(x, shipment, companyId, EVA)).toBe(false);
    expect((await linksOf(companyId))[0]).toMatchObject({ removedReason: "removed", removedById: EVA.id, removedByName: "Eva Malá" });
    // Off every sailing: a deleted shipment has no box to leave.
    expect(await repo.dropDeletedShipment(shipment, companyId, { id: null, name: "" })).toBe(0);
    expect(await repo.link(y, [shipment], companyId, JANA)).toBe(true);
    expect(await repo.dropDeletedShipment(shipment, companyId, { id: JANA.id, name: JANA.name })).toBe(1);
    const [, second] = await linksOf(companyId);
    expect(second).toMatchObject({ sailingId: y, removedReason: "shipment_deleted", removedByName: "Jana Nová" });
    expect(await live(companyId)).toEqual([]);
  });
});

describe("Edit sailing", () => {
  // The sailing's own facts as they are: these edits leave them alone.
  const factsOf = (now: CoLoadingSailingRecord) => ({ vessel: now.vessel, voyage: now.voyage, pol: now.pol, pod: now.pod, hub: now.hub, containerType: now.containerType });
  const twoContainers = (now: CoLoadingSailingRecord) => ({ facts: factsOf(now), changes: [{ kind: "containers", oldAmount: now.containerCount, newAmount: 2, oldNote: "", newNote: "" }] });

  it("writes the details and their record of changes together", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId, { departureDate: "2026-12-10" });
    const row = await repo.setDetailsRecorded(s.id, companyId, { containerCount: 2, cutoffDate: "2026-12-05" }, EVA, twoContainers);
    // A departure date left out stays as it was.
    expect(row).toMatchObject({ containerCount: 2, cutoffDate: "2026-12-05", departureDate: "2026-12-10" });
    expect((await recordOf(s.id, companyId)).map((c) => [c.containerNo, c.kind, c.oldAmount, c.newAmount, c.changedById, c.changedByName])).toEqual([
      [0, "containers", "1.00", "2.00", EVA.id, "Eva Malá"],
    ]);
  });

  it("writes the sailing's own facts: a week becomes the vessel, a wrong port is put right", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    const facts = { vessel: "MSC Anna", voyage: "445W", pol: "Ningbo (CNNGB)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "20' DC" };
    const row = await repo.setDetailsRecorded(s.id, companyId, { containerCount: 1, cutoffDate: null }, EVA, () => ({
      facts,
      changes: [{ kind: "vessel", oldAmount: null, newAmount: null, oldNote: "WEEK 51", newNote: "MSC Anna" }],
    }));
    expect(row).toMatchObject(facts);
    expect((await recordOf(s.id, companyId)).map((c) => [c.containerNo, c.kind, c.oldNote, c.newNote])).toEqual([[0, "vessel", "WEEK 51", "MSC Anna"]]);
  });

  it("writes nothing, details nor record, when the change is refused", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    const refuse = () => {
      throw new Error("refused");
    };
    await expect(repo.setDetailsRecorded(s.id, companyId, { containerCount: 3, cutoffDate: null, departureDate: "2026-12-10" }, EVA, refuse)).rejects.toThrow("refused");
    expect(await sailingRow(s.id)).toMatchObject({ containerCount: 1, departureDate: null });
    expect(await recordOf(s.id, companyId)).toEqual([]);
  });

  it("judges the change with the costs as they are once the sailing is locked: a cost saved meanwhile is seen", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    let seen: number[] | null = null;
    const judge = (now: CoLoadingSailingRecord, costed: number[]) => {
      seen = costed;
      return { facts: factsOf(now), changes: [] };
    };
    // A save of the box costs holds the sailing's lock while it writes container 1's cost.
    let edit: Promise<unknown> | null = null;
    await db.transaction(async (tx) => {
      await tx.select({ id: sailings.id }).from(sailings).where(eq(sailings.id, s.id)).for("update");
      edit = repo.setDetailsRecorded(s.id, companyId, { containerCount: 1, cutoffDate: "2026-12-01" }, EVA, judge);
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Edit sailing waits for the lock: it has judged nothing yet.
      expect(seen).toBeNull();
      await tx.insert(costs).values({ companyId, sailingId: s.id, containerNo: 1, kind: "ocean", amount: "1000.00", currency: "EUR" });
    });
    await edit;
    expect(seen).toEqual([1]);
  });

  it("is not found for another company's sailing, and changes nothing of it", async () => {
    const [companyId, other] = [randomUUID(), randomUUID()];
    const s = await newSailing(companyId);
    expect(await repo.setDetailsRecorded(s.id, other, { containerCount: 2, cutoffDate: null }, EVA, twoContainers)).toBeNull();
    expect((await sailingRow(s.id)).containerCount).toBe(1);
    expect(await recordOf(s.id, other)).toEqual([]);
  });
});

describe("removing a sailing, and the sailings still to come (Council Outlay 14)", () => {
  it("removes an empty sailing, tells the judge what it holds, and removes nothing when the judge refuses", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    let seen: [number, number[]] | null = null;
    const refuse = (linked: number, costed: number[]) => {
      seen = [linked, costed];
      throw new Error("refused");
    };
    await expect(repo.removeJudged(s.id, companyId, refuse)).rejects.toThrow("refused");
    expect(seen).toEqual([0, []]);
    expect((await sailingRow(s.id)).deletedAt).toBeNull();
    // Another company removes nothing of this one's.
    expect(await repo.removeJudged(s.id, randomUUID(), () => undefined)).toBe(false);
    expect(await repo.removeJudged(s.id, companyId, () => undefined)).toBe(true);
    expect((await sailingRow(s.id)).deletedAt).not.toBeNull();
    expect(await repo.get(s.id, companyId)).toBeNull();
    // Gone once: a second removal finds nothing.
    expect(await repo.removeJudged(s.id, companyId, () => undefined)).toBe(false);
  });

  it("lists a service's sailings still to come, the soonest first and the undated last, and names the sailing a shipment is on", async () => {
    const companyId = randomUUID();
    const serviceId = randomUUID();
    const past = await newSailing(companyId, { serviceId, vessel: "WEEK 40", departureDate: "2026-10-01" });
    const later = await newSailing(companyId, { serviceId, vessel: "WEEK 52", departureDate: "2026-12-24" });
    const sooner = await newSailing(companyId, { serviceId, vessel: "WEEK 51", departureDate: "2026-12-17" });
    const undated = await newSailing(companyId, { serviceId, vessel: "WEEK 53" });
    await newSailing(companyId, { vessel: "WEEK 51" });
    expect((await repo.comingOfServices([serviceId], companyId, "2026-11-24")).map((r) => r.vessel)).toEqual(["WEEK 51", "WEEK 52", "WEEK 53"]);
    // The day of departure still counts as to come.
    expect((await repo.comingOfServices([serviceId], companyId, "2026-12-24")).map((r) => r.id)).toEqual([later.id, undated.id]);
    expect(await repo.comingOfServices([], companyId, "2026-11-24")).toEqual([]);
    const shipment = randomUUID();
    expect(await repo.sailingOfShipment(shipment, companyId)).toBeNull();
    await repo.link(sooner.id, [shipment], companyId, JANA);
    expect((await repo.sailingOfShipment(shipment, companyId))?.id).toBe(sooner.id);
    expect((await repo.sailingsOf([shipment], companyId))[0]).toMatchObject({ sailingId: sooner.id, serviceId, vessel: "WEEK 51" });
    expect(past.id).not.toBe(sooner.id);
  });
});

describe("moving or removing several shipments in one turn (Council Outlay 14, A9)", () => {
  it("moves all of them or none, and takes all of them off or none", async () => {
    const companyId = randomUUID();
    const [x, y] = [randomUUID(), randomUUID()];
    const [s1, s2, s3] = [randomUUID(), randomUUID(), randomUUID()];
    await repo.link(x, [s1, s2], companyId, JANA);
    // s3 is not on x: neither s1 nor s3 moves.
    expect(await repo.moveMany(x, y, [s1, s3], companyId, EVA, "Box full")).toBe(false);
    expect((await live(companyId)).sort()).toEqual([[x, s1], [x, s2]].sort());
    expect(await repo.moveMany(x, y, [s1, s2], companyId, EVA, "Box full")).toBe(true);
    expect((await live(companyId)).sort()).toEqual([[y, s1], [y, s2]].sort());
    const left = (await linksOf(companyId)).filter((l) => l.sailingId === x);
    expect(left.every((l) => l.removedReason === "moved" && l.movedToSailingId === y && l.removedNote === "Box full" && l.removedByName === "Eva Malá")).toBe(true);
    expect(await repo.unlinkMany(y, [s1, s3], companyId, JANA)).toBe(false);
    expect((await live(companyId)).length).toBe(2);
    expect(await repo.unlinkMany(y, [s1, s2], companyId, JANA)).toBe(true);
    expect(await live(companyId)).toEqual([]);
  });
});
