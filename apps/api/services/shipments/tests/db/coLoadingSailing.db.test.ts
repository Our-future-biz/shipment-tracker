import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../../db/db";
import { constraintOf, isUniqueViolation } from "../../../../lib/db/errors";
import { coLoadingSailingRepository as repo } from "../../repositories/coLoadingSailing.repository";
import { coLoadingBoxCostChangeTable as changes, coLoadingBoxCostTable as costs } from "../../schemas/coLoadingBoxCost.schema";
import { coLoadingSailingTable as sailings, type CoLoadingSailingRecord } from "../../schemas/coLoadingSailing.schema";
import { coLoadingSailingShipmentTable as links } from "../../schemas/coLoadingSailingShipment.schema";
import { shipmentTable } from "../../schemas/shipment.schema";

// The SQL a sailing's box and Edit sailing rely on (migrations 0098-0110), against the shipments
// database: linking all or none under the one live link per shipment, a move that says where the
// shipment went and why, taking a shipment off by hand or because it was deleted, Edit sailing
// written with its record of changes under the sailing's lock, a link and a removal of the sailing
// one after the other under that lock, the stage, the "told that it is over" mark, the waiting
// shipments and the one sailing per Master Job. Every row belongs to the test's own company. Runs
// only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const JANA = { id: randomUUID(), name: "Jana Nová" };
const EVA = { id: randomUUID(), name: "Eva Malá" };
// A link or a move judged as on an open sailing: its links keep no reason.
const open = () => "";

const newSailing = async (companyId: string, more: Partial<typeof sailings.$inferInsert> = {}) => {
  const [row] = await db
    .insert(sailings)
    .values({ companyId, serviceId: randomUUID(), vessel: "WEEK 51", voyage: "", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC", ...more })
    .returning();
  return row!;
};
const newShipment = async (companyId: string, more: Partial<typeof shipmentTable.$inferInsert> = {}) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZLCL${randomUUID().slice(0, 8)}`, tradeDirection: "Import", ...more }).returning();
  return row!;
};
const linksOf = (companyId: string) => db.select().from(links).where(eq(links.companyId, companyId)).orderBy(asc(links.createdAt), asc(links.id));
const live = async (companyId: string) => (await linksOf(companyId)).filter((l) => l.deletedAt === null).map((l) => [l.sailingId, l.shipmentId]);
const recordOf = (sailingId: string, companyId: string) =>
  db.select().from(changes).where(and(eq(changes.companyId, companyId), eq(changes.sailingId, sailingId))).orderBy(asc(changes.kind));
const sailingRow = async (id: string) => (await db.select().from(sailings).where(eq(sailings.id, id)))[0]!;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("linking shipments to a sailing", () => {
  it("links all of them, or none when one is on a sailing already", async () => {
    const companyId = randomUUID();
    const [x, y] = [await newSailing(companyId), await newSailing(companyId)];
    const [s1, s2, s3] = [randomUUID(), randomUUID(), randomUUID()];
    expect(await repo.link(x.id, [s2], companyId, JANA, open)).toBe("linked");
    // s2 is on x: linking s1 and s2 to y links neither.
    expect(await repo.link(y.id, [s1, s2], companyId, EVA, open)).toBe("taken");
    expect(await live(companyId)).toEqual([[x.id, s2]]);
    expect(await repo.link(y.id, [s1, s3], companyId, EVA, open)).toBe("linked");
    expect((await live(companyId)).sort()).toEqual([[x.id, s2], [y.id, s1], [y.id, s3]].sort());
    expect((await linksOf(companyId)).find((l) => l.shipmentId === s1)).toMatchObject({ createdById: EVA.id, createdByName: "Eva Malá" });
  });

  it("keeps the note the judge gives, judged on the sailing as it is under its lock, and links nothing when it refuses", async () => {
    const companyId = randomUUID();
    const x = await newSailing(companyId, { stage: "closed" });
    const shipment = randomUUID();
    let seen: string | null = null;
    const refuse = (now: CoLoadingSailingRecord) => {
      seen = now.stage;
      throw new Error("refused");
    };
    await expect(repo.link(x.id, [shipment], companyId, JANA, refuse)).rejects.toThrow("refused");
    expect(seen).toBe("closed");
    expect(await live(companyId)).toEqual([]);
    expect(await repo.link(x.id, [shipment], companyId, JANA, () => "Carrier took it late")).toBe("linked");
    expect((await linksOf(companyId))[0]).toMatchObject({ linkedNote: "Carrier took it late" });
  });

  it("links nothing to a sailing that is removed, or another company's", async () => {
    const [companyId, other] = [randomUUID(), randomUUID()];
    const x = await newSailing(companyId);
    expect(await repo.link(x.id, [randomUUID()], other, JANA, open)).toBe("gone");
    await repo.removeJudged(x.id, companyId, () => undefined);
    expect(await repo.link(x.id, [randomUUID()], companyId, JANA, open)).toBe("gone");
    expect(await linksOf(companyId)).toEqual([]);
    expect(await linksOf(other)).toEqual([]);
  });

  it("waits for a removal of the sailing that holds its lock, and then links nothing to it", async () => {
    const companyId = randomUUID();
    const x = await newSailing(companyId);
    let linking: Promise<unknown> | null = null;
    let settled = false;
    // A removal holds the sailing's lock while it judges what the sailing holds, then removes it.
    await db.transaction(async (tx) => {
      await tx.select({ id: sailings.id }).from(sailings).where(eq(sailings.id, x.id)).for("update");
      linking = repo.link(x.id, [randomUUID()], companyId, JANA, open).finally(() => (settled = true));
      await pause(300);
      expect(settled).toBe(false);
      await tx.update(sailings).set({ deletedAt: new Date() }).where(eq(sailings.id, x.id));
    });
    expect(await linking).toBe("gone");
    expect(await live(companyId)).toEqual([]);
  });

  it("is seen by a removal that comes after it: the sailing is not removed with a shipment on it", async () => {
    const companyId = randomUUID();
    const x = await newSailing(companyId);
    const shipment = await newShipment(companyId);
    let removing: Promise<unknown> | null = null;
    let seen: number | null = null;
    // A link holds the sailing's lock (for share) while it writes; the removal waits, then counts the shipment.
    await db.transaction(async (tx) => {
      await tx.select({ id: sailings.id }).from(sailings).where(eq(sailings.id, x.id)).for("share");
      removing = repo.removeJudged(x.id, companyId, (linked) => {
        seen = linked;
        if (linked > 0) throw new Error("holds a shipment");
      });
      await pause(300);
      expect(seen).toBeNull();
      await tx.insert(links).values({ companyId, sailingId: x.id, shipmentId: shipment.id, createdByName: "Jana Nová" });
    });
    await expect(removing).rejects.toThrow("holds a shipment");
    expect(seen).toBe(1);
    expect((await sailingRow(x.id)).deletedAt).toBeNull();
  });

  it("keeps one company's links from another's: the same shipment id is free in another company", async () => {
    const [companyId, other] = [randomUUID(), randomUUID()];
    const [x, y] = [await newSailing(companyId), await newSailing(other)];
    const shipment = randomUUID();
    expect(await repo.link(x.id, [shipment], companyId, JANA, open)).toBe("linked");
    expect(await repo.link(y.id, [shipment], other, JANA, open)).toBe("linked");
    // The other company takes nothing of this one's off, though it names the sailing and the shipment.
    expect(await repo.unlink(x.id, shipment, other, JANA)).toBe(false);
    expect(await repo.dropDeletedShipment(shipment, other, { id: JANA.id, name: JANA.name })).toBe(y.id);
    expect(await live(companyId)).toEqual([[x.id, shipment]]);
  });

  it("names only a live sailing as the one a shipment is on", async () => {
    const companyId = randomUUID();
    const x = await newSailing(companyId);
    const shipment = randomUUID();
    await repo.link(x.id, [shipment], companyId, JANA, open);
    expect((await repo.sailingsOf([shipment], companyId)).map((l) => l.sailingId)).toEqual([x.id]);
    // A link left on a removed sailing (before links waited for its lock) puts the shipment on none.
    await db.update(sailings).set({ deletedAt: new Date() }).where(eq(sailings.id, x.id));
    expect(await repo.sailingsOf([shipment], companyId)).toEqual([]);
    expect(await repo.sailingsOf([shipment], randomUUID())).toEqual([]);
  });
});

describe("moving a shipment to another sailing", () => {
  it("takes it off the first, saying where it went and why, and links it to the second, in one turn", async () => {
    const companyId = randomUUID();
    const [x, y] = [await newSailing(companyId), await newSailing(companyId)];
    const shipment = randomUUID();
    await repo.link(x.id, [shipment], companyId, JANA, open);
    expect(await repo.move(x.id, y.id, shipment, companyId, EVA, "Box full, rolled to next week", open)).toBe("moved");
    const [left, now] = await linksOf(companyId);
    expect(left).toMatchObject({ sailingId: x.id, removedReason: "moved", movedToSailingId: y.id, removedNote: "Box full, rolled to next week", removedById: EVA.id, removedByName: "Eva Malá" });
    expect(left!.deletedAt).not.toBeNull();
    expect(now).toMatchObject({ sailingId: y.id, shipmentId: shipment, deletedAt: null, createdByName: "Eva Malá", linkedNote: "" });
    // It is no longer on the first sailing: moving it from there again finds nothing, and writes nothing.
    expect(await repo.move(x.id, y.id, shipment, companyId, EVA, "again", open)).toBe("not_on_it");
    expect(await linksOf(companyId)).toHaveLength(2);
  });

  it("hands the judge both sailings as they are under their lock - a removed target as none - and writes nothing when it refuses", async () => {
    const companyId = randomUUID();
    const [x, y] = [await newSailing(companyId), await newSailing(companyId, { stage: "closed" })];
    const shipment = randomUUID();
    await repo.link(x.id, [shipment], companyId, JANA, open);
    const seen: [string, string | null][] = [];
    const judge = (from: CoLoadingSailingRecord, to: CoLoadingSailingRecord | null) => {
      seen.push([from.id, to?.stage ?? null]);
      if (!to) throw new Error("no target");
      return "Box full";
    };
    expect(await repo.move(x.id, y.id, shipment, companyId, EVA, "Box full", judge)).toBe("moved");
    expect((await live(companyId))[0]).toEqual([y.id, shipment]);
    expect((await linksOf(companyId)).find((l) => l.deletedAt === null)).toMatchObject({ linkedNote: "Box full" });
    const z = await newSailing(companyId);
    await repo.removeJudged(z.id, companyId, () => undefined);
    await expect(repo.move(y.id, z.id, shipment, companyId, EVA, "again", judge)).rejects.toThrow("no target");
    expect(seen).toEqual([[x.id, "closed"], [y.id, null]]);
    expect(await live(companyId)).toEqual([[y.id, shipment]]);
    // Nor from a sailing that is gone.
    expect(await repo.move(z.id, y.id, shipment, companyId, EVA, "x", open)).toBe("gone");
  });
});

describe("taking a shipment off a sailing", () => {
  it("by hand records who did it; it can then be linked again, and a deleted shipment leaves its box saying why", async () => {
    const companyId = randomUUID();
    const [x, y] = [await newSailing(companyId), await newSailing(companyId)];
    const shipment = randomUUID();
    await repo.link(x.id, [shipment], companyId, JANA, open);
    expect(await repo.unlink(x.id, shipment, companyId, EVA)).toBe(true);
    expect(await repo.unlink(x.id, shipment, companyId, EVA)).toBe(false);
    expect((await linksOf(companyId))[0]).toMatchObject({ removedReason: "removed", removedById: EVA.id, removedByName: "Eva Malá" });
    // Off every sailing: a deleted shipment has no box to leave.
    expect(await repo.dropDeletedShipment(shipment, companyId, { id: null, name: "" })).toBeNull();
    expect(await repo.link(y.id, [shipment], companyId, JANA, open)).toBe("linked");
    // The sailing it left, whose box is now lighter.
    expect(await repo.dropDeletedShipment(shipment, companyId, { id: JANA.id, name: JANA.name })).toBe(y.id);
    const [, second] = await linksOf(companyId);
    expect(second).toMatchObject({ sailingId: y.id, removedReason: "shipment_deleted", removedByName: "Jana Nová" });
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
      await pause(300);
      // Edit sailing waits for the lock: it has judged nothing yet.
      expect(seen).toBeNull();
      await tx.insert(costs).values({ companyId, sailingId: s.id, containerNo: 1, kind: "ocean", amount: "1000.00", currency: "EUR", updatedById: JANA.id, updatedByName: JANA.name });
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

describe("a sailing's stage (Council Outlay 14, C3)", () => {
  it("is set and recorded together, judged on the stage it has under its lock; a judge giving no change writes nothing", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    let seen: string | null = null;
    const row = await repo.setStageRecorded(s.id, companyId, "departed", EVA, (now) => {
      seen = now;
      return { kind: "stage", oldAmount: null, newAmount: null, oldNote: "Open", newNote: "Departed" };
    });
    expect(seen).toBe("open");
    expect(row).toMatchObject({ stage: "departed" });
    expect((await recordOf(s.id, companyId)).map((c) => [c.containerNo, c.kind, c.oldNote, c.newNote, c.changedByName])).toEqual([[0, "stage", "Open", "Departed", "Eva Malá"]]);
    expect(await repo.setStageRecorded(s.id, companyId, "departed", EVA, () => null)).toMatchObject({ stage: "departed" });
    expect(await recordOf(s.id, companyId)).toHaveLength(1);
  });

  it("is not found for another company's sailing, and writes nothing of it", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    expect(await repo.setStageRecorded(s.id, randomUUID(), "closed", EVA, () => ({ kind: "stage", oldAmount: null, newAmount: null, oldNote: "Open", newNote: "Closed for cargo" }))).toBeNull();
    expect((await sailingRow(s.id)).stage).toBe("open");
  });
});

describe("cargo changed since linked, and the \"told that it is over\" mark (Council Outlay 14, C4)", () => {
  it("remembers a shipment's figures on its live link here only, and only where none is remembered yet", async () => {
    const companyId = randomUUID();
    const [x, y] = [await newSailing(companyId), await newSailing(companyId)];
    const [s1, s2] = [randomUUID(), randomUUID()];
    await repo.link(x.id, [s1], companyId, JANA, open);
    await repo.link(y.id, [s2], companyId, JANA, open);
    await repo.rememberLinked(x.id, companyId, [
      { shipmentId: s1, weightKg: 1200, volumeCbm: 2.5 },
      // Not on x: nothing is written for it.
      { shipmentId: s2, weightKg: 9999, volumeCbm: 99 },
    ]);
    // A later call does not write over the figures of the day of linking.
    await repo.rememberLinked(x.id, companyId, [{ shipmentId: s1, weightKg: 5000, volumeCbm: 9 }]);
    // Another company remembers nothing on this one's links.
    await repo.rememberLinked(y.id, randomUUID(), [{ shipmentId: s2, weightKg: 1, volumeCbm: 1 }]);
    const byShipment = new Map((await linksOf(companyId)).map((l) => [l.shipmentId, [l.linkedWeightKg, l.linkedVolumeCbm]]));
    expect(byShipment.get(s1)).toEqual(["1200.0", "2.500"]);
    expect(byShipment.get(s2)).toEqual([null, null]);
  });

  it("is claimed once: a second claim while it is set finds it set, and it can be claimed again once cleared", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    const both = await Promise.all([repo.claimOverNotice(s.id, companyId), repo.claimOverNotice(s.id, companyId)]);
    expect(both.sort()).toEqual([false, true]);
    expect((await sailingRow(s.id)).overNotified).toBe(true);
    await repo.setOverNotified(s.id, companyId, false);
    expect(await repo.claimOverNotice(s.id, randomUUID())).toBe(false);
    expect(await repo.claimOverNotice(s.id, companyId)).toBe(true);
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
    await repo.link(sooner.id, [shipment], companyId, JANA, open);
    expect((await repo.sailingOfShipment(shipment, companyId))?.id).toBe(sooner.id);
    expect((await repo.sailingsOf([shipment], companyId))[0]).toMatchObject({ sailingId: sooner.id, serviceId, vessel: "WEEK 51" });
    expect(past.id).not.toBe(sooner.id);
  });
});

describe("the shipments waiting for a box (Council Outlay 14, A6)", () => {
  it("counts the live shipments on no sailing by Service Name - trimmed of tabs and no-break spaces too, as a service's page reads it - mode and load type", async () => {
    const companyId = randomUUID();
    const kind = { freightMode: "Sea Freight", loadType: "Consolidation" };
    await newShipment(companyId, { serviceName: "ISHA", ...kind });
    await newShipment(companyId, { serviceName: "\tisha ", ...kind });
    await newShipment(companyId, { serviceName: " Isha ", freightMode: "Sea Freight", loadType: "Full Load" });
    // On a sailing, cancelled, deleted, with no Service Name, or another company's: none of them waits.
    const linked = await newShipment(companyId, { serviceName: "ISHA", ...kind });
    await repo.link((await newSailing(companyId)).id, [linked.id], companyId, JANA, open);
    await newShipment(companyId, { serviceName: "ISHA", status: "Cancelled Shipment", ...kind });
    await newShipment(companyId, { serviceName: "ISHA", deletedAt: new Date(), ...kind });
    await newShipment(companyId, { serviceName: " \t ", ...kind });
    await newShipment(randomUUID(), { serviceName: "ISHA", ...kind });
    const waiting = await repo.waitingByKind(companyId, "Cancelled Shipment");
    expect(waiting.map((w) => [w.serviceName, w.loadType, Number(w.shipments)]).sort()).toEqual([
      ["isha", "Consolidation", 2],
      ["isha", "Full Load", 1],
    ]);
  });
});

describe("a sailing's Master Job (Council Outlay 14, C2)", () => {
  it("is set and recorded together under the sailing's lock, and found as the one live sailing of that Master Job", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    const masterJob = { id: randomUUID(), mczNumber: "MCZLCL00000012" };
    expect(await repo.setMasterJobJudged(s.id, companyId, EVA, async () => undefined, async () => masterJob)).toEqual(masterJob);
    expect((await sailingRow(s.id)).masterJobId).toBe(masterJob.id);
    expect((await repo.sailingOfMasterJob(masterJob.id, companyId))?.id).toBe(s.id);
    expect(await repo.sailingOfMasterJob(masterJob.id, randomUUID())).toBeNull();
    expect((await recordOf(s.id, companyId)).map((c) => [c.kind, c.oldNote, c.newNote, c.changedByName])).toEqual([["master_job", "", "MCZLCL00000012", "Eva Malá"]]);
    await repo.clearMasterJob(s.id, companyId, "MCZLCL00000012", JANA);
    expect((await sailingRow(s.id)).masterJobId).toBeNull();
    expect(await repo.sailingOfMasterJob(masterJob.id, companyId)).toBeNull();
  });

  it("makes nothing and writes nothing when the judge refuses under the lock, and is not found for another company's sailing", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId, { masterJobId: randomUUID() });
    let made = 0;
    const make = async () => {
      made += 1;
      return { id: randomUUID(), mczNumber: "MCZLCL1" };
    };
    await expect(
      repo.setMasterJobJudged(s.id, companyId, EVA, async (now) => {
        if (now.masterJobId) throw new Error("has one");
      }, make),
    ).rejects.toThrow("has one");
    expect(await repo.setMasterJobJudged(s.id, randomUUID(), EVA, async () => undefined, make)).toBeNull();
    expect(made).toBe(0);
    expect(await recordOf(s.id, companyId)).toEqual([]);
  });

  it("of two creates at one moment, lets the second judge see the first one's Master Job", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    const judge = async (now: CoLoadingSailingRecord) => {
      if (now.masterJobId) throw new Error("has one");
    };
    const make = async () => {
      await pause(200);
      return { id: randomUUID(), mczNumber: "MCZLCL2" };
    };
    const both = await Promise.allSettled([repo.setMasterJobJudged(s.id, companyId, EVA, judge, make), repo.setMasterJobJudged(s.id, companyId, JANA, judge, make)]);
    expect(both.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await recordOf(s.id, companyId)).toHaveLength(1);
  });

  it("belongs to one live sailing: the database refuses it on a second, and frees it once that sailing is removed", async () => {
    const companyId = randomUUID();
    const [s1, s2] = [await newSailing(companyId), await newSailing(companyId)];
    const masterJob = { id: randomUUID(), mczNumber: "MCZLCL00000013" };
    await repo.setMasterJobJudged(s1.id, companyId, EVA, async () => undefined, async () => masterJob);
    const refused = await repo.setMasterJobJudged(s2.id, companyId, EVA, async () => undefined, async () => masterJob).catch((err: unknown) => err);
    expect(isUniqueViolation(refused)).toBe(true);
    expect(constraintOf(refused)).toBe("co_loading_sailing_one_master_job");
    expect((await sailingRow(s2.id)).masterJobId).toBeNull();
    expect(await recordOf(s2.id, companyId)).toEqual([]);
    // The same Master Job id in another company is another company's.
    const other = randomUUID();
    const s3 = await newSailing(other);
    expect(await repo.setMasterJobJudged(s3.id, other, EVA, async () => undefined, async () => masterJob)).toEqual(masterJob);
    await repo.removeJudged(s1.id, companyId, () => undefined);
    expect(await repo.setMasterJobJudged(s2.id, companyId, EVA, async () => undefined, async () => masterJob)).toEqual(masterJob);
  });
});

describe("moving or removing several shipments in one turn (Council Outlay 14, A9)", () => {
  it("moves all of them or none, and takes all of them off or none", async () => {
    const companyId = randomUUID();
    const [x, y] = [await newSailing(companyId), await newSailing(companyId)];
    const [s1, s2, s3] = [randomUUID(), randomUUID(), randomUUID()];
    await repo.link(x.id, [s1, s2], companyId, JANA, open);
    // s3 is not on x: neither s1 nor s3 moves.
    expect(await repo.moveMany(x.id, y.id, [s1, s3], companyId, EVA, "Box full", open)).toBe("not_on_it");
    expect((await live(companyId)).sort()).toEqual([[x.id, s1], [x.id, s2]].sort());
    expect(await repo.moveMany(x.id, y.id, [s1, s2], companyId, EVA, "Box full", open)).toBe("moved");
    expect((await live(companyId)).sort()).toEqual([[y.id, s1], [y.id, s2]].sort());
    const left = (await linksOf(companyId)).filter((l) => l.sailingId === x.id);
    expect(left.every((l) => l.removedReason === "moved" && l.movedToSailingId === y.id && l.removedNote === "Box full" && l.removedByName === "Eva Malá")).toBe(true);
    expect(await repo.unlinkMany(y.id, [s1, s3], companyId, JANA)).toBe(false);
    expect((await live(companyId)).length).toBe(2);
    expect(await repo.unlinkMany(y.id, [s1, s2], companyId, JANA)).toBe(true);
    expect(await live(companyId)).toEqual([]);
  });
});
