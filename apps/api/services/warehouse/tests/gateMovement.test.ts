import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { defaultReleaseGates, gateMovementService, isArmed } from "../services/gateMovement.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";

const company = () => randomUUID();
const user = randomUUID();
const allOk = (gates: ReturnType<typeof defaultReleaseGates>) => gates.map((g) => ({ ...g, s: "OK" as const }));

describe("release gates", () => {
  it("uses the LCL set for consolidation and the FCL set for full boxes", () => {
    expect(defaultReleaseGates("Import", "LCL consolidation", "Under Customs Clearance").map((g) => [g.g, g.s])).toEqual([
      ["B/L / release order", "Pending"],
      ["Customs", "Pending"],
      ["Charges", "OK"],
      ["Storage settled", "OK"],
    ]);
    expect(defaultReleaseGates("Export", "LCL consolidation", "Customs Cleared/Released").find((g) => g.g === "Customs")!.s).toBe("OK");
    expect(defaultReleaseGates("Export", "FCL stuffing", "Paperwork Verified").map((g) => g.g)).toContain("VGM submitted");
  });

  it("arms only when every gate except the empty return is OK, or on override", () => {
    const gates = allOk(defaultReleaseGates("Import", "FCL stripping", "Customs Cleared/Released"));
    expect(isArmed({ releaseStatus: "", status: "Expected", overridden: false, releaseGates: gates })).toBe(true);
    const emptyPending = gates.map((g) => (/empty return/i.test(g.g) ? { ...g, s: "Pending" as const } : g));
    expect(isArmed({ releaseStatus: "", status: "Expected", overridden: false, releaseGates: emptyPending })).toBe(true);
    const customsPending = gates.map((g) => (g.g === "Customs" ? { ...g, s: "Blocked" as const } : g));
    expect(isArmed({ releaseStatus: "", status: "Expected", overridden: false, releaseGates: customsPending })).toBe(false);
    expect(isArmed({ releaseStatus: "", status: "Expected", overridden: true, releaseGates: customsPending })).toBe(true);
    expect(isArmed({ releaseStatus: "", status: "Refused", overridden: false, releaseGates: gates })).toBe(false);
    // A release picked by hand in the gate log wins over the gates.
    const customsBlocked = gates.map((g) => (g.g === "Customs" ? { ...g, s: "Blocked" as const } : g));
    expect(isArmed({ releaseStatus: "Released", status: "Expected", overridden: false, releaseGates: customsBlocked })).toBe(true);
    expect(isArmed({ releaseStatus: "Blocked", status: "Expected", overridden: true, releaseGates: gates })).toBe(false);
  });
});

describe("gate movement flow", () => {
  it("blocks WH release until armed, then stamps release and gate-out", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091601-1", visit: "výdej", handling: "Import", customsMode: "T1", mrn: "26CZ1" });
    expect(m.armed).toBe(false);
    expect(m.needsAttention).toBe(true);
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);

    await gateMovementService.update(m.id, c, user, { releaseGates: allOk(m.releaseGates) });
    const released = await gateMovementService.stamp(m.id, c, user, "impRelease");
    expect(released).toMatchObject({ status: "Released", armed: true, needsAttention: false });
    expect(released.impRelease).not.toBeNull();
    expect(released.gateOut).not.toBeNull();
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/already/);
  });

  it("clears the customs line of the release gate only when customs is released", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091606", visit: "výdej", handling: "Export", mrn: "26CZ2" });
    expect(m.customsStatus).toBe("Waiting For Commercial Paperwork");
    expect(m.releaseGates.find((g) => g.g === "Customs")!.s).toBe("Pending");
    expect(m.armed).toBe(false);
    const cleared = await gateMovementService.update(m.id, c, user, { customsStatus: "Customs Cleared/Released" });
    expect(cleared.releaseGates.find((g) => g.g === "Customs")).toEqual({ g: "Customs", s: "OK", note: "released" });
    expect(cleared.armed).toBe(true);
    const back = await gateMovementService.update(m.id, c, user, { customsStatus: "Under Customs Clearance" });
    expect(back.armed).toBe(false);
  });

  it("keeps the export draft when the receipt is confirmed", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091602", handling: "Export" });
    await expect(gateMovementService.stamp(m.id, c, user, "expReceipt")).rejects.toThrow(/draft/);
    const draft = await gateMovementService.stamp(m.id, c, user, "expDraft");
    expect(draft.status).toBe("In Warehouse");
    const receipt = await gateMovementService.stamp(m.id, c, user, "expReceipt");
    expect(receipt.status).toBe("In Warehouse");
    expect(receipt.expDraft).toBe(draft.expDraft);
    expect(receipt.events.map((e) => e.kind)).toEqual(["created", "expDraft", "expReceipt"]);
  });

  it("requires a reason to refuse and to override; override re-arms a refused row", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091603", visit: "výdej", plate: "3AB 1234" });
    await expect(gateMovementService.refuse(m.id, c, user, "  ")).rejects.toThrow(/reason/);
    const refused = await gateMovementService.refuse(m.id, c, user, "customs not discharged");
    expect(refused).toMatchObject({ status: "Refused", armed: false });
    expect(refused.refusalLog).toMatch(/plate 3AB 1234 · REFUSED: customs not discharged/);

    await expect(gateMovementService.override(m.id, c, user, "")).rejects.toThrow(/reason/);
    const overridden = await gateMovementService.override(m.id, c, user, "duty paid, papers on the way");
    expect(overridden).toMatchObject({ status: "In Warehouse", overridden: true, armed: true });
    expect(overridden.overrideLog).toMatch(/gates at moment of override: .*reason: duty paid/);
  });

  it("verifies the PIN without revealing it and locks after three misses", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091604", visit: "výdej", pin: "4471" });
    expect(m.hasPin).toBe(true);
    expect(JSON.stringify(m)).not.toContain("4471");
    expect(await gateMovementService.verifyPin(m.id, c, user, "4471")).toEqual({ result: "match", tries: 0 });
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    expect(await gateMovementService.verifyPin(m.id, c, user, "0000")).toEqual({ result: "locked", tries: 3 });
    expect((await gateMovementService.verifyPin(m.id, c, user, "4471")).result).toBe("locked");
    expect((await gateMovementService.get(m.id, c)).pinLocked).toBe(true);
  });

  it("creates walk-ins unlinked with no pre-advice and a gate-in time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { walkIn: true, plate: "9C8 1122", colli: 3 });
    expect(m).toMatchObject({ gateRef: "— walk-in", status: "Expected", customer: "(unknown — no pre-advice)", positionRef: "", warehouseTaskId: null });
    expect(m.gateIn).not.toBeNull();
    await expect(gateMovementService.create(c, user, { plate: "X" })).rejects.toThrow(/Gate ref is required/);
  });

  it("keeps companies apart", async () => {
    const m = await gateMovementService.create(company(), user, { gateRef: "WCZ2026091605" });
    await expect(gateMovementService.get(m.id, company())).rejects.toThrow(/not found/);
  });
});

describe("warehouse tasks in the gate log", () => {
  it("gives every warehouse task exactly one gate row, once", async () => {
    const c = company();
    const { task } = await warehouseTaskRepository.createForShipment(c, randomUUID(), "WCZ20260916");
    const manual = await gateMovementService.create(c, user, { gateRef: "manual" });

    const first = await gateMovementService.list(c);
    const row = first.find((m) => m.warehouseTaskId === task.id);
    expect(row).toMatchObject({ gateRef: task.taskId, positionRef: task.taskId, status: "Expected", visit: "výdej", handling: "Import" });
    expect(first.map((m) => m.id)).toContain(manual.id);

    await Promise.all([gateMovementService.list(c), gateMovementService.list(c)]);
    expect((await gateMovementService.list(c)).filter((m) => m.warehouseTaskId === task.id)).toHaveLength(1);
  });

  it("does not bring back a row deleted by hand", async () => {
    const c = company();
    const { task } = await warehouseTaskRepository.createForShipment(c, randomUUID(), "WCZ20260916");
    const row = (await gateMovementService.list(c)).find((m) => m.warehouseTaskId === task.id)!;
    await gateMovementService.remove(row.id, c);
    expect((await gateMovementService.list(c)).some((m) => m.warehouseTaskId === task.id)).toBe(false);
  });

  it("drops untouched rows when the task leaves the warehouse but keeps rows the gate acted on", async () => {
    const c = company();
    const a = (await warehouseTaskRepository.createForShipment(c, randomUUID(), "WCZ20260916")).task;
    const b = (await warehouseTaskRepository.createForShipment(c, randomUUID(), "WCZ20260916")).task;
    const rows = await gateMovementService.list(c);
    const rowB = rows.find((m) => m.warehouseTaskId === b.id)!;
    await gateMovementService.stamp(rowB.id, c, user, "gateIn");

    for (const t of [a, b]) {
      await warehouseTaskRepository.softDelete(t.id, c);
      await gateMovementService.removeForTask(t.id, c);
    }
    const after = await gateMovementService.list(c);
    expect(after.some((m) => m.warehouseTaskId === a.id)).toBe(false);
    expect(after.find((m) => m.id === rowB.id)).toMatchObject({ status: "In Warehouse", positionRef: "" });
  });
});

describe("gate movement detail", () => {
  it("keeps the three transport legs and copies the gate leg to carrier / driver / plate", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091607", visit: "příjem" });
    expect(m.transportLegs.map((l) => l.leg)).toEqual(["IN", "OUT", "CFS"]);
    const saved = await gateMovementService.update(m.id, c, user, {
      transportLegs: [{ leg: "IN", company: "Pepa Transport s.r.o.", plate: "1A1 1122", driver: "Josef Svoboda", phone: "+420 777 111 222", gateTime: "" }],
    });
    expect(saved.transportLegs).toHaveLength(3);
    expect(saved).toMatchObject({ carrier: "Pepa Transport s.r.o.", plate: "1A1 1122", driver: "Josef Svoboda" });
    expect(saved.transportLegs.find((l) => l.leg === "IN")!.phone).toBe("+420 777 111 222");
  });

  it("limits sub-positions to ten, clears the VGM date when VGM is off and upgrades old drops", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091608" });
    const drop = {
      etw: "2026-08-24", qty: 2, packing: "Cartons", width: 120, length: 80, height: 145, description: "Electronic components",
      weight: 3900, measure: 4.2, totalGross: 3960, plate: "1A1 1122", driver: "Josef Svoboda", transport: "Pepa Transport s.r.o.",
      vgm: false, vgmDate: "2026-08-24", storageDays: 7,
    };
    const saved = await gateMovementService.update(m.id, c, user, { subPositions: [drop, { ...drop, vgm: true }] });
    expect(saved.subPositions.map((p) => p.vgmDate)).toEqual(["", "2026-08-24"]);
    expect(saved.subPositions[0]).toMatchObject({ width: 120, measure: 4.2, totalGross: 3960, storageDays: 7 });
    await expect(gateMovementService.update(m.id, c, user, { subPositions: Array(11).fill(drop) })).rejects.toThrow(/At most 10/);

    // A drop saved before the width / length / height columns existed.
    await gateMovementRepository.update(m.id, c, {
      subPositions: [{ qty: 1, etw: "35/2026", dimensions: "80 × 60 × 90 cm", whDate: "" } as never],
    });
    expect((await gateMovementService.get(m.id, c)).subPositions[0]).toMatchObject({ qty: 1, etw: "", width: null, measure: null, vgm: false });
  });

  it("saves one survey per container with its lines, capped to the pieces on the movement", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091609", colli: 5 });
    const line = { qty: 5, outerPacking: "Cartons", visual: ["Broken", "Dented"], inner: ["Not visible"] };
    const base = { phase: "Receipt — survey on gate in", lines: [line], driverNote: "", warehouseNote: "" };
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, container: "MSKU 123456-7", damaged: 9, lost: 0 });
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, container: "TCLU 765432-1", damaged: 1, lost: 1 });
    const again = await gateMovementService.saveSurvey(m.id, c, user, {
      ...base,
      container: "MSKU 123456-7",
      damaged: 2,
      lost: 0,
      lines: [line, { qty: 2, outerPacking: "Pallets", visual: [], inner: [] }],
    });
    expect(again.surveys).toHaveLength(2);
    expect(again.surveys.find((s) => s.container === "MSKU 123456-7")).toMatchObject({ damaged: 2, lines: [line, { qty: 2, outerPacking: "Pallets" }] });
    expect(again.surveys.every((s) => !!s.surveyedAt)).toBe(true);
    const capped = await gateMovementService.saveSurvey(m.id, c, user, { ...base, container: "X", damaged: 9, lost: -1, lines: [] });
    expect(capped.surveys.find((s) => s.container === "X")).toMatchObject({ damaged: 5, lost: 0, lines: [{ qty: null, outerPacking: "", visual: [], inner: [] }] });
  });

  it("reads a survey saved before survey lines as one line", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091611" });
    await gateMovementRepository.update(m.id, c, {
      surveys: [{ container: "", phase: "Both", damaged: 0, lost: 0, outerPacking: "Case", visual: ["Wet"], inner: [], driverNote: "", warehouseNote: "", surveyedAt: "x", surveyedBy: "" } as never],
    });
    expect((await gateMovementService.get(m.id, c)).surveys[0]!.lines).toEqual([{ qty: null, outerPacking: "Case", visual: ["Wet"], inner: [] }]);
  });

  it("clears the UN number when the cargo is no longer dangerous", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091612" });
    const dg = await gateMovementService.update(m.id, c, user, { dangerousGoods: true, unNumber: "UN 1263" });
    expect(dg.unNumber).toBe("UN 1263");
    expect((await gateMovementService.update(m.id, c, user, { dangerousGoods: false })).unNumber).toBe("");
  });
});

describe("standalone warehouse positions", () => {
  it("get their own WCZ reference and gate row without a shipment", async () => {
    const { warehouseService } = await import("../services/warehouse.service");
    const c = company();
    const task = await warehouseService.createPosition(c, new Date("2026-09-16T10:00:00Z"));
    expect(task).toMatchObject({ taskId: "WCZ2026091601", shipmentId: null });
    const movement = await gateMovementService.create(c, user, { warehouseTaskId: task.id, customer: "Alpine Trading", handling: "Export" });
    expect(movement).toMatchObject({ gateRef: "WCZ2026091601", positionRef: "WCZ2026091601", customer: "Alpine Trading" });

    // A second standalone position the same day continues the numbering, and the backfill
    // for shipment positions leaves it alone (exactly one gate row).
    expect((await warehouseService.createPosition(c, new Date("2026-09-16T11:00:00Z"))).taskId).toBe("WCZ2026091602");
    const rows = await gateMovementService.list(c);
    expect(rows.filter((m) => m.warehouseTaskId === task.id)).toHaveLength(1);
  });
});
