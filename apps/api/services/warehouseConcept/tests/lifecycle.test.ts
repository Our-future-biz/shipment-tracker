import { describe, expect, it } from "vitest";
import { positionLifecycle, type LifecycleMovement } from "../services/lifecycle";
import { movementStorage } from "../services/storage";
import { containerStatus, containerTotals, directionFits } from "../services/containerRules";

const at = (s: string) => new Date(s);
const base = (p: Partial<LifecycleMovement>): LifecycleMovement => ({
  visit: "příjem",
  status: "Expected",
  createdAt: at("2026-10-01T08:00:00Z"),
  gateIn: null,
  expDraft: null,
  expReceipt: null,
  impRelease: null,
  loadInDate: "",
  receivedAt: null,
  leftAt: null,
  ...p,
});
const stages = (l: ReturnType<typeof positionLifecycle>) => l.steps.map((s) => `${s.stage}${s.done ? "✓" : ""}`);

describe("position lifecycle", () => {
  it("inbound: expected → arrived → received → in warehouse → stuffed → left with the container", () => {
    expect(positionLifecycle(base({}), false).stage).toBe("expected");
    expect(positionLifecycle(base({ gateIn: at("2026-10-02T08:00:00Z") }), false)).toMatchObject({ stage: "arrived", at: "2026-10-02T08:00:00.000Z" });
    const rec = base({ gateIn: at("2026-10-02T08:00:00Z"), expDraft: at("2026-10-02T08:00:00Z"), expReceipt: at("2026-10-02T09:00:00Z") });
    expect(positionLifecycle(rec, false).stage).toBe("in_warehouse");
    const link = { stuffedAt: at("2026-10-05T10:00:00Z"), tickedAt: null, tallyOutcome: "", containerGateInAt: at("2026-10-05T07:00:00Z") };
    const stuffed = positionLifecycle(rec, false, link);
    expect(stuffed.stage).toBe("stuffed");
    expect(stages(stuffed)).toEqual(["expected✓", "arrived✓", "received✓", "in_warehouse✓", "stuffed✓", "left"]);
    const left = positionLifecycle({ ...rec, leftAt: at("2026-10-05T12:00:00Z"), status: "Released" }, false, link);
    expect(left).toMatchObject({ stage: "left", at: "2026-10-05T12:00:00.000Z" });
    // Without a container the WH release is the leaving.
    expect(positionLifecycle({ ...rec, impRelease: at("2026-10-06T12:00:00Z") }, true).stage).toBe("left");
    expect(stages(positionLifecycle(rec, false))).not.toContain("stuffed");
  });

  it("outbound: arrives with its container, is received at the tally tick, ready when armed, leaves at WH release", () => {
    const out = base({ visit: "výdej" });
    const link = { stuffedAt: null, tickedAt: null, tallyOutcome: "", containerGateInAt: null };
    expect(positionLifecycle(out, true, link).stage).toBe("expected");
    const arrived = { ...link, containerGateInAt: at("2026-10-03T06:00:00Z") };
    expect(positionLifecycle(out, true, arrived)).toMatchObject({ stage: "arrived", at: "2026-10-03T06:00:00.000Z" });
    // With a container, a typed received date does not count — the tally does.
    expect(positionLifecycle({ ...out, loadInDate: "2026-10-03" }, false, arrived).stage).toBe("arrived");
    const ticked = { ...out, receivedAt: at("2026-10-03T08:00:00Z"), loadInDate: "2026-10-03" };
    expect(positionLifecycle(ticked, false, { ...arrived, tallyOutcome: "received" }).stage).toBe("in_warehouse");
    expect(positionLifecycle(ticked, true, { ...arrived, tallyOutcome: "received" }).stage).toBe("ready");
    expect(positionLifecycle({ ...ticked, impRelease: at("2026-10-04T08:00:00Z") }, true, arrived).stage).toBe("left");
    // No container: the received date typed by hand.
    expect(positionLifecycle({ ...out, loadInDate: "2026-10-03" }, false)).toMatchObject({ stage: "in_warehouse", at: "2026-10-03" });
    // A refusal is a flag, not a stage.
    expect(positionLifecycle({ ...out, status: "Refused" }, false)).toMatchObject({ stage: "expected", refused: true });
  });
});

describe("storage clock with containers", () => {
  const m = { gateOut: null, impRelease: null, loadInDate: "", freeDays: null, measureCbm: 1, weightKg: 100 };
  it("starts outbound cargo at the tally tick (Prague day), before the typed date", () => {
    const s = movementStorage({ ...m, visit: "výdej", gateIn: null, loadInDate: "2026-10-01", receivedAt: at("2026-10-03T22:30:00Z") }, at("2026-10-05T10:00:00Z"));
    expect(s).toMatchObject({ startDate: "2026-10-04", startSource: "tally", daysInWarehouse: 2 });
  });
  it("stops inbound cargo at the gate-out of the container it left in", () => {
    const s = movementStorage({ ...m, visit: "příjem", gateIn: at("2026-10-01T08:00:00Z"), leftAt: at("2026-10-04T08:00:00Z") }, at("2026-10-20T10:00:00Z"));
    expect(s).toMatchObject({ stopped: true, stopDate: "2026-10-04", daysInWarehouse: 4 });
  });
});

describe("container rules", () => {
  it("fits directions, derives the status and totals against capacity", () => {
    expect(directionFits("Loading", "příjem")).toBe(true);
    expect(directionFits("Loading", "výdej")).toBe(false);
    expect(directionFits("Unloading", "výdej")).toBe(true);
    const none = { gateInAt: null, strippingStartedAt: null, closedAt: null, gateOutAt: null };
    const open = { stuffedAt: null, tallyOutcome: "", tickedAt: null, addedBy: "Clerk" };
    expect(containerStatus({ ...none, direction: "Unloading" }, [open])).toBe("Expected");
    expect(containerStatus({ ...none, direction: "Unloading", gateInAt: at("2026-10-01T00:00:00Z") }, [open])).toBe("Arrived");
    expect(containerStatus({ ...none, direction: "Unloading", gateInAt: at("2026-10-01T00:00:00Z") }, [{ ...open, tallyOutcome: "short" }])).toBe("Stripped");
    // An old one-position link (migration 0017) is not tallied: it never makes the stripping complete.
    expect(containerStatus({ ...none, direction: "Unloading", gateInAt: at("2026-10-01T00:00:00Z") }, [{ ...open, addedBy: "migration" }])).toBe("Arrived");
    expect(containerStatus({ ...none, direction: "Loading" }, [open])).toBe("Planning");
    expect(containerStatus({ ...none, direction: "Loading" }, [{ ...open, stuffedAt: at("2026-10-01T00:00:00Z") }])).toBe("Stuffing");
    expect(containerTotals("20' DV", [{ colli: 10, weightKg: 30_000, measureCbm: 20 }])).toMatchObject({ fillCbmPct: 65, fillKgPct: 106, overCapacity: true });
    expect(containerTotals("unknown", [])).toMatchObject({ capacityCbm: null, fillCbmPct: null, overCapacity: false });
  });
});
