import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { defaultReleaseGates, gateMovementService, isArmed, needsAttention } from "../services/gateMovement.service";
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
    expect(isArmed({ status: "Expected", overridden: false, releaseGates: gates })).toBe(true);
    const emptyPending = gates.map((g) => (/empty return/i.test(g.g) ? { ...g, s: "Pending" as const } : g));
    expect(isArmed({ status: "Expected", overridden: false, releaseGates: emptyPending })).toBe(true);
    const customsPending = gates.map((g) => (g.g === "Customs" ? { ...g, s: "Blocked" as const } : g));
    expect(isArmed({ status: "Expected", overridden: false, releaseGates: customsPending })).toBe(false);
    expect(isArmed({ status: "Expected", overridden: true, releaseGates: customsPending })).toBe(true);
    expect(isArmed({ status: "Refused", overridden: false, releaseGates: gates })).toBe(false);
  });

  it("flags only outgoing cargo: release blocked, or no MRN while customs is not cleared", () => {
    const gates = defaultReleaseGates("Import", "LCL consolidation", "Under Customs Clearance");
    const base = { status: "In Warehouse", overridden: false, releaseGates: gates, mrn: "", customsStatus: "Under Customs Clearance", impRelease: null, gateOut: null };
    expect(needsAttention({ ...base, visit: "příjem" })).toBe(false);
    expect(needsAttention({ ...base, visit: "výdej" })).toBe(true);
    expect(needsAttention({ ...base, visit: "výdej", overridden: true })).toBe(true);
    expect(needsAttention({ ...base, visit: "výdej", overridden: true, mrn: "26CZ1" })).toBe(false);
    expect(needsAttention({ ...base, visit: "výdej", overridden: true, customsStatus: "Customs Cleared/Released" })).toBe(false);
    // Released or gone out: nothing left to attend to.
    expect(needsAttention({ ...base, visit: "výdej", gateOut: new Date() })).toBe(false);
    expect(needsAttention({ ...base, visit: "výdej", impRelease: new Date() })).toBe(false);
  });
});

describe("gate movement flow", () => {
  it("blocks WH release until armed, then stamps release and gate-out", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091601-1", visit: "výdej", handling: "Import", customsMode: "T1", mrn: "26CZ1" });
    expect(m.armed).toBe(false);
    expect(m.needsAttention).toBe(true);
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);

    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
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

  it("lets outgoing cargo leave only through WH release", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091620", visit: "výdej", mrn: "26CZ3" });
    await expect(gateMovementService.stamp(m.id, c, user, "gateOut")).rejects.toThrow(/WH release first/);
    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
    // Armed but not released yet: still only through the release.
    await expect(gateMovementService.stamp(m.id, c, user, "gateOut")).rejects.toThrow(/WH release first/);
    expect((await gateMovementService.get(m.id, c)).gateOut).toBeNull();
    // Incoming cargo: the truck leaves on its own gate-out.
    const inc = await gateMovementService.create(c, user, { gateRef: "WCZ2026091621", visit: "příjem" });
    expect((await gateMovementService.stamp(inc.id, c, user, "gateOut")).gateOut).not.toBeNull();
  });

  it("checks the release gates at the moment of the release, not at load", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091622", visit: "výdej", mrn: "26CZ4" });
    // The row looks armed when loaded, but its gates change before the UPDATE runs.
    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
    const load = gateMovementRepository.findById.bind(gateMovementRepository);
    const spy = vi.spyOn(gateMovementRepository, "findById").mockImplementationOnce(async (...args) => {
      const row = await load(...args);
      await gateMovementRepository.update(m.id, c, { releaseGates: m.releaseGates });
      return row;
    });
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);
    spy.mockRestore();
    expect((await gateMovementService.get(m.id, c)).impRelease).toBeNull();
  });

  it("does not let an export stamp undo a refusal", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091623", handling: "Export" });
    await gateMovementService.refuse(m.id, c, user, "wrong cargo");
    expect((await gateMovementService.stamp(m.id, c, user, "expDraft")).status).toBe("Refused");
  });

  it("keeps the export draft when the receipt is confirmed", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091602", handling: "Export" });
    await expect(gateMovementService.stamp(m.id, c, user, "expReceipt")).rejects.toThrow(/draft/);
    const draft = await gateMovementService.stamp(m.id, c, user, "expDraft");
    expect(draft.status).toBe("In Warehouse");
    // The draft receipt is the first arrival stamp, so it stamps gate-in too.
    expect(draft.gateIn).toBe(draft.expDraft);
    const receipt = await gateMovementService.stamp(m.id, c, user, "expReceipt");
    expect(receipt.status).toBe("In Warehouse");
    expect(receipt.expDraft).toBe(draft.expDraft);
    expect(receipt.gateIn).toBe(draft.gateIn);
    expect(receipt.events.map((e) => e.kind)).toEqual(["created", "gateIn", "expDraft", "expReceipt"]);
  });

  it("does not let the general update change status, release gates or the override", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091613", visit: "výdej" });
    const saved = await gateMovementService.update(m.id, c, user, {
      status: "Released",
      releaseGates: allOk(m.releaseGates),
      releaseStatus: "Released",
      overridden: true,
      note: "kept",
    } as never);
    expect(saved).toMatchObject({ status: m.status, releaseGates: m.releaseGates, overridden: false, armed: false, note: "kept" });
    expect(saved).not.toHaveProperty("releaseStatus");
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

describe("direction", () => {
  it("moves the gate visit with the trade direction until the first stamp, then locks", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091640", visit: "výdej", handling: "Import" });
    const flipped = await gateMovementService.update(m.id, c, user, { handling: "Export" });
    expect(flipped).toMatchObject({ handling: "Export", visit: "příjem" });
    const back = await gateMovementService.update(m.id, c, user, { visit: "výdej" });
    expect(back).toMatchObject({ handling: "Import", visit: "výdej" });
    await gateMovementService.stamp(m.id, c, user, "gateIn");
    await expect(gateMovementService.update(m.id, c, user, { handling: "Export" })).rejects.toThrow(/cannot change/);
  });
});

describe("release gate lines", () => {
  it("arms an import release once every line is ticked, and logs each tick", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091630", visit: "výdej", handling: "Import", mrn: "26CZ9" });
    await gateMovementService.update(m.id, c, user, { customsStatus: "Customs Cleared/Released" });
    expect((await gateMovementService.get(m.id, c)).armed).toBe(false);
    const ticked = await gateMovementService.setReleaseGate(m.id, c, user, "B/L / release order", true);
    expect(ticked.releaseGates.find((g) => g.g === "B/L / release order")!.s).toBe("OK");
    expect(ticked.armed).toBe(true);
    expect(ticked.events.filter((e) => e.kind === "releaseGate").map((e) => e.label)).toEqual(["B/L / release order: OK"]);
    const back = await gateMovementService.setReleaseGate(m.id, c, user, "B/L / release order", false);
    expect(back.armed).toBe(false);
  });

  it("never ticks Customs by hand, nor lines after release", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091631", visit: "výdej", handling: "Import", mrn: "26CZ10" });
    await expect(gateMovementService.setReleaseGate(m.id, c, user, "Customs", true)).rejects.toThrow(/customs status/);
    await expect(gateMovementService.setReleaseGate(m.id, c, user, "No such gate", true)).rejects.toThrow(/No release gate/);
    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
    await gateMovementService.stamp(m.id, c, user, "impRelease");
    await expect(gateMovementService.setReleaseGate(m.id, c, user, "Charges", false)).rejects.toThrow(/already released/);
  });

  it("keeps both changes when two lines are ticked at the same time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091632", visit: "výdej", handling: "Import", operationType: "FCL import", mrn: "26CZ11" });
    const pending = m.releaseGates.filter((g) => g.s === "Pending" && g.g !== "Customs").map((g) => g.g);
    const results = await Promise.allSettled(pending.map((g) => gateMovementService.setReleaseGate(m.id, c, user, g, true)));
    // A tick that lost the race is refused, never silently dropped: retry those and all land.
    for (const [i, r] of results.entries()) if (r.status === "rejected") await gateMovementService.setReleaseGate(m.id, c, user, pending[i]!, true);
    const after = await gateMovementService.get(m.id, c);
    expect(after.releaseGates.filter((g) => pending.includes(g.g)).every((g) => g.s === "OK")).toBe(true);
    expect(after.events.filter((e) => e.kind === "releaseGate")).toHaveLength(pending.length);
  });
});

describe("parallel gate actions", () => {
  it("stamps gate-in once when ten clerks press it at the same time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091614" });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => gateMovementService.stamp(m.id, c, user, "gateIn")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(9);
    expect(rejected.every((r) => /already/.test(String(r.reason)))).toBe(true);
    expect((await gateMovementService.get(m.id, c)).events.filter((e) => e.kind === "gateIn")).toHaveLength(1);
  });

  it("gives parallel wrong PINs no more than three tries and logs the lock once", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091615", visit: "výdej", pin: "4471" });
    const results = await Promise.all(Array.from({ length: 10 }, () => gateMovementService.verifyPin(m.id, c, user, "0000")));
    expect(results.filter((r) => r.result === "no_match")).toHaveLength(2);
    expect(results.filter((r) => r.result === "locked")).toHaveLength(8);
    const after = await gateMovementService.get(m.id, c);
    expect(after.pinTries).toBe(3);
    expect(after.events.filter((e) => e.kind === "pinLocked")).toHaveLength(1);
    expect((await gateMovementService.verifyPin(m.id, c, user, "4471")).result).toBe("locked");
  });

  it("does not report a lock while a right PIN only holds a try for a moment", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091624", visit: "výdej", pin: "4471" });
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    const results = await Promise.all(Array.from({ length: 4 }, () => gateMovementService.verifyPin(m.id, c, user, "4471")));
    expect(results.every((r) => r.result === "match")).toBe(true);
    expect((await gateMovementService.get(m.id, c)).pinTries).toBe(2);
  });

  it("refuses once when five refusals arrive together", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091616", visit: "výdej" });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => gateMovementService.refuse(m.id, c, user, "no papers")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await gateMovementService.get(m.id, c)).events.filter((e) => e.kind === "refused")).toHaveLength(1);
  });

  it("keeps surveys of different containers saved at the same time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091617", colli: 5 });
    const base = { phase: "Receipt — survey on gate in", damaged: 0, lost: 0, lines: [], driverNote: "", warehouseNote: "" };
    await Promise.all(["A", "B", "C", "D"].map((container) => gateMovementService.saveSurvey(m.id, c, user, { ...base, container })));
    expect((await gateMovementService.get(m.id, c)).surveys.map((s) => s.container).sort()).toEqual(["A", "B", "C", "D"]);
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
    // Linked outbound: the release also waits for the pick-up PIN from Shipments.
    expect(row!.releaseGates.filter((g) => g.g === "Pick-up PIN verified")).toEqual([{ g: "Pick-up PIN verified", s: "Pending", note: "waiting for the driver's PIN" }]);
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

  it("keeps the receipt and the release survey of a container apart", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091618", colli: 4 });
    const base = { container: "MSKU 123456-7", lost: 0, lines: [], driverNote: "", warehouseNote: "" };
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Receipt — survey on gate in", damaged: 1 });
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Release — survey on gate out", damaged: 2 });
    const again = await gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Release — survey on gate out", damaged: 3 });
    expect(again.surveys.map((s) => [s.phase, s.damaged])).toEqual([
      ["Receipt — survey on gate in", 1],
      ["Release — survey on gate out", 3],
    ]);
    await expect(gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Both", damaged: 0 })).rejects.toThrow(/phase/);
  });

  it("records damage when the pieces on the movement are not known", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091619" });
    const saved = await gateMovementService.saveSurvey(m.id, c, user, {
      container: "", phase: "Receipt — survey on gate in", damaged: 3, lost: 1.7, lines: [], driverNote: "", warehouseNote: "",
    });
    expect(saved.surveys[0]).toMatchObject({ damaged: 3, lost: 1 });
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

describe("label prints", () => {
  it("logs the first print as printed and every later one as reprinted, changing nothing else", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091630", visit: "výdej" });
    const first = await gateMovementService.labelPrinted(m.id, c, user, 1);
    const second = await gateMovementService.labelPrinted(m.id, c, user, 12);
    expect(second.events.filter((e) => e.kind === "labelPrinted").map((e) => [e.label, e.detail])).toEqual([
      ["Label printed", "1 label"],
      ["Label reprinted", "12 labels"],
    ]);
    expect(first.events.at(-1)!.label).toBe("Label printed");
    const { events: _e, updatedAt: _u, ...before } = m;
    const { events: _e2, updatedAt: _u2, ...after } = second;
    expect(after).toEqual(before);
  });

  it("keeps every event when ten prints arrive together", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091631" });
    await Promise.all(Array.from({ length: 10 }, () => gateMovementService.labelPrinted(m.id, c, user, 2)));
    const prints = (await gateMovementService.get(m.id, c)).events.filter((e) => e.kind === "labelPrinted");
    expect(prints).toHaveLength(10);
    expect(prints.filter((e) => e.label === "Label printed").length).toBeGreaterThanOrEqual(1);
  });

  it("rejects copies outside 1–500 and rows that are gone", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091632" });
    for (const copies of [0, 501, 1.5, -1]) {
      await expect(gateMovementService.labelPrinted(m.id, c, user, copies)).rejects.toThrow(/whole number/);
    }
    await gateMovementService.remove(m.id, c);
    await expect(gateMovementService.labelPrinted(m.id, c, user, 1)).rejects.toThrow(/not found/);
    await expect(gateMovementService.labelPrinted(m.id, company(), user, 1)).rejects.toThrow(/not found/);
  });
});

describe("shipment link on the gate row", () => {
  it("carries the shipment id of a linked task and null otherwise", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const { task } = await warehouseTaskRepository.createForShipment(c, shipmentId, "WCZ20260916");
    const linked = (await gateMovementService.list(c)).find((m) => m.warehouseTaskId === task.id)!;
    expect(linked.shipmentId).toBe(shipmentId);
    expect((await gateMovementService.get(linked.id, c)).shipmentId).toBe(shipmentId);
    const walkIn = await gateMovementService.create(c, user, { gateRef: "WCZ2026091633" });
    expect(walkIn.shipmentId).toBeNull();
  });
});
