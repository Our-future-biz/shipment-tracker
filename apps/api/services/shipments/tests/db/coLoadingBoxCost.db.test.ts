import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../../db/db";
import { BoxCostsChangedMeanwhile, coLoadingBoxCostRepository as repo } from "../../repositories/coLoadingBoxCost.repository";
import { coLoadingSailingRepository } from "../../repositories/coLoadingSailing.repository";
import { coLoadingBoxCostChangeTable as changes } from "../../schemas/coLoadingBoxCost.schema";
import { coLoadingSailingTable as sailings } from "../../schemas/coLoadingSailing.schema";

// The SQL a sailing's box costs rely on (migrations 0102 and 0103), against the shipments database
// (Council Review 7, K18): a cost row and its record of change written together, the record's "old"
// figure being the one really replaced, a save over costs changed meanwhile refused with nothing
// written, two saves at one moment taken one after the other, one company's costs kept from
// another's, and a service's defaults that lock nothing until a person changes them (Council
// Outlay 14, B4). Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const JANA = { id: randomUUID(), name: "Jana Nová" };
const EVA = { id: randomUUID(), name: "Eva Malá" };
const line = (kind: string, amount: number | null, currency = "EUR", note = "") => ({ kind, amount, currency, note });
const three = (ocean: number | null, more: { origin?: number | null; destination?: number | null } = {}) => [line("origin", more.origin ?? null), line("ocean", ocean, "USD"), line("destination", more.destination ?? null)];

const newSailing = async (companyId: string) => {
  const [row] = await db
    .insert(sailings)
    .values({ companyId, serviceId: randomUUID(), vessel: "WEEK 51", voyage: "", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC" })
    .returning();
  return row!;
};
const recordOf = (sailingId: string, companyId: string) =>
  db.select().from(changes).where(and(eq(changes.companyId, companyId), eq(changes.sailingId, sailingId))).orderBy(asc(changes.changedAt), asc(changes.kind));
const stored = async (sailingId: string, companyId: string) => (await repo.list(sailingId, companyId)).map((r) => [r.containerNo, r.kind, r.amount, r.currency, r.updatedByName]);

describe("a container's box costs, saved", () => {
  it("write the cost and its record of change together: who, the old figure and the new", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000), [], JANA);
    expect(await stored(s.id, companyId)).toEqual([[1, "ocean", "1000.00", "USD", "Jana Nová"]]);
    await repo.save(s.id, companyId, 1, three(1500), three(1000), EVA);
    expect(await stored(s.id, companyId)).toEqual([[1, "ocean", "1500.00", "USD", "Eva Malá"]]);
    expect((await recordOf(s.id, companyId)).map((c) => [c.kind, c.oldAmount, c.newAmount, c.changedByName])).toEqual([
      ["ocean", null, "1000.00", "Jana Nová"],
      ["ocean", "1000.00", "1500.00", "Eva Malá"],
    ]);
  });

  it("write nothing, and no record, when nothing changed", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000), [], JANA);
    await repo.save(s.id, companyId, 1, three(1000), three(1000), EVA);
    expect(await recordOf(s.id, companyId)).toHaveLength(1);
    expect(await stored(s.id, companyId)).toEqual([[1, "ocean", "1000.00", "USD", "Jana Nová"]]);
  });

  it("tell 0 from not set, and a cost cleared from one never set", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(0), [], JANA);
    await repo.save(s.id, companyId, 1, three(null), three(0), JANA);
    expect((await recordOf(s.id, companyId)).map((c) => [c.oldAmount, c.newAmount])).toEqual([
      [null, "0.00"],
      ["0.00", null],
    ]);
    expect(await repo.costedContainers(s.id, companyId)).toEqual([]);
  });

  it("are refused over costs somebody changed since the dialog read them: nothing is written, and who changed them is named", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000), [], JANA);
    await repo.save(s.id, companyId, 1, three(1500), three(1000), EVA);
    // Jana's dialog still shows 1,000: she types only Origin Costs.
    const stale = repo.save(s.id, companyId, 1, three(1000, { origin: 300 }), three(1000), JANA);
    await expect(stale).rejects.toBeInstanceOf(BoxCostsChangedMeanwhile);
    await expect(stale).rejects.toMatchObject({ by: "Eva Malá" });
    expect(await stored(s.id, companyId)).toEqual([[1, "ocean", "1500.00", "USD", "Eva Malá"]]);
    expect(await recordOf(s.id, companyId)).toHaveLength(2);
  });

  it("of two saves at one moment take one after the other: the second is refused, not written over the first", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000), [], JANA);
    const both = await Promise.allSettled([repo.save(s.id, companyId, 1, three(1200), three(1000), JANA), repo.save(s.id, companyId, 1, three(900), three(1000), EVA)]);
    expect(both.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const record = await recordOf(s.id, companyId);
    expect(record).toHaveLength(2);
    // The one that went through replaced 1,000: its record says so.
    expect(record[1]!.oldAmount).toBe("1000.00");
  });

  it("keep each container's costs apart, and name the containers that have some", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000), [], JANA);
    await repo.save(s.id, companyId, 3, three(null, { destination: 500 }), [], JANA);
    expect(await repo.costedContainers(s.id, companyId)).toEqual([1, 3]);
    expect((await repo.listOf([s.id], companyId)).filter((r) => r.amount !== null)).toHaveLength(2);
  });

  it("keep one company's costs and record from another, also when it knows the sailing's id", async () => {
    const companyId = randomUUID();
    const other = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000), [], JANA);
    expect(await repo.list(s.id, other)).toEqual([]);
    expect(await repo.listOf([s.id], other)).toEqual([]);
    expect(await repo.changes(s.id, other)).toEqual([]);
    expect(await repo.costedContainers(s.id, other)).toEqual([]);
  });

  it("that are the service's defaults, set by nobody, lock neither Edit sailing nor a removal - and are money all the same (Council Outlay 14, B4)", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000, { destination: 300 }), null, { id: null, name: "Service default" });
    expect(await stored(s.id, companyId)).toEqual([
      [1, "destination", "300.00", "EUR", "Service default"],
      [1, "ocean", "1000.00", "USD", "Service default"],
    ]);
    expect((await recordOf(s.id, companyId)).map((c) => [c.kind, c.changedById, c.changedByName]).sort()).toEqual([
      ["destination", null, "Service default"],
      ["ocean", null, "Service default"],
    ]);
    expect(await repo.costedContainers(s.id, companyId)).toEqual([]);
    let seen: number[] | null = null;
    await coLoadingSailingRepository.setDetailsRecorded(s.id, companyId, { containerCount: 1, cutoffDate: null }, EVA, (now, costed) => {
      seen = costed;
      return { facts: { vessel: now.vessel, voyage: now.voyage, pol: now.pol, pod: now.pod, hub: now.hub, containerType: now.containerType }, changes: [] };
    });
    expect(seen).toEqual([]);
    let held: number[] | null = null;
    await expect(
      coLoadingSailingRepository.removeJudged(s.id, companyId, (_linked, costed) => {
        held = costed;
        throw new Error("kept");
      }),
    ).rejects.toThrow("kept");
    expect(held).toEqual([]);
  });

  it("that a manager changes become a person's: the dialog showing the defaults saves over them, and the container counts as costed", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    await repo.save(s.id, companyId, 1, three(1000), null, { id: null, name: "Service default" });
    await repo.save(s.id, companyId, 2, three(1000), null, { id: null, name: "Service default" });
    await repo.save(s.id, companyId, 1, three(1200), three(1000), EVA);
    expect(await stored(s.id, companyId)).toEqual([
      [1, "ocean", "1200.00", "USD", "Eva Malá"],
      [2, "ocean", "1000.00", "USD", "Service default"],
    ]);
    expect(await repo.costedContainers(s.id, companyId)).toEqual([1]);
    // A dialog that still shows the defaults names who changed them meanwhile.
    await expect(repo.save(s.id, companyId, 1, three(900), three(1000), JANA)).rejects.toMatchObject({ by: "Eva Malá" });
  });

  it("record a change of the sailing itself in the same record, under container 0", async () => {
    const companyId = randomUUID();
    const s = await newSailing(companyId);
    // Edit sailing writes it with the change (coLoadingSailing.repository setDetailsRecorded).
    const changed = [{ kind: "containers", oldAmount: 2, newAmount: 1, oldNote: "", newNote: "" }, { kind: "departure", oldAmount: null, newAmount: null, oldNote: "", newNote: "2026-11-20" }];
    await coLoadingSailingRepository.setDetailsRecorded(s.id, companyId, { containerCount: 1, cutoffDate: null, departureDate: "2026-11-20" }, EVA, (now) => ({ facts: { vessel: now.vessel, voyage: now.voyage, pol: now.pol, pod: now.pod, hub: now.hub, containerType: now.containerType }, changes: changed }));
    expect((await repo.changes(s.id, companyId)).map((c) => [c.containerNo, c.kind, c.oldAmount, c.newAmount, c.newNote, c.changedByName]).sort()).toEqual([
      [0, "containers", "2.00", "1.00", "", "Eva Malá"],
      [0, "departure", null, null, "2026-11-20", "Eva Malá"],
    ]);
  });
});
