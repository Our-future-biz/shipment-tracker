import { describe, expect, it } from "vitest";
import { HANDOVER_HINT, HANDOVER_LABEL, HANDOVER_NOT_KNOWN, handoverParts, showHandoverLine, type CockpitHandover } from "./cockpitHandover";

const line = (over: Partial<CockpitHandover> = {}): CockpitHandover => ({
  warehouseUpdatesWaiting: 0,
  warehouseUpdatesFailed: 0,
  truckingUpdatesWaiting: 0,
  truckingUpdatesFailed: 0,
  ...over,
});

/** A part as it reads on screen: "Warehouse updates to the jobs: 2 waiting · 1 failed". */
const read = (handover: CockpitHandover) => handoverParts(handover).map((p) => `${p.label}: ${p.waiting.text} waiting · ${p.failed.text} failed`);

describe("Shipments → Managers: whether the hand-over line is drawn", () => {
  it("is hidden when all four figures are 0", () => {
    expect(showHandoverLine(line())).toBe(false);
    expect(handoverParts(line())).toEqual([]);
  });

  it("is hidden for an answer from before step 5, which has no line", () => {
    expect(showHandoverLine(undefined)).toBe(false);
    expect(showHandoverLine(null)).toBe(false);
    expect(handoverParts(undefined)).toEqual([]);
  });

  it("is drawn when any one figure is above 0", () => {
    for (const key of ["warehouseUpdatesWaiting", "warehouseUpdatesFailed", "truckingUpdatesWaiting", "truckingUpdatesFailed"] as const) {
      expect(showHandoverLine(line({ [key]: 1 })), key).toBe(true);
    }
  });

  it("is drawn when any one figure could not be read - not known is not 0", () => {
    for (const key of ["warehouseUpdatesWaiting", "warehouseUpdatesFailed", "truckingUpdatesWaiting", "truckingUpdatesFailed"] as const) {
      expect(showHandoverLine(line({ [key]: null })), key).toBe(true);
    }
  });
});

describe("Shipments → Managers: what the hand-over line says", () => {
  it("names its two parts, warehouse first, with both figures of each - also the zeros", () => {
    expect(read(line({ warehouseUpdatesWaiting: 2, truckingUpdatesFailed: 1 }))).toEqual([
      "Warehouse updates to the jobs: 2 waiting · 0 failed",
      "Trucking updates to the jobs: 0 waiting · 1 failed",
    ]);
  });

  it("draws a failed figure above 0 red, a waiting one never", () => {
    const [warehouse, trucking] = handoverParts(line({ warehouseUpdatesWaiting: 5, warehouseUpdatesFailed: 3, truckingUpdatesWaiting: 4 }));
    expect(warehouse!.waiting.hot).toBe(false);
    expect(warehouse!.failed.hot).toBe(true);
    expect(trucking!.waiting.hot).toBe(false);
    expect(trucking!.failed.hot).toBe(false);
  });

  it("shows a figure that was not read as '–', not red, and says so on hover", () => {
    const parts = handoverParts(line({ truckingUpdatesWaiting: null, truckingUpdatesFailed: null }));
    expect(read(line({ truckingUpdatesWaiting: null, truckingUpdatesFailed: null }))).toEqual([
      "Warehouse updates to the jobs: 0 waiting · 0 failed",
      "Trucking updates to the jobs: – waiting · – failed",
    ]);
    const trucking = parts.find((p) => p.key === "trucking")!;
    expect(trucking.waiting).toEqual({ text: "–", notKnown: true, hot: false });
    expect(trucking.failed).toEqual({ text: "–", notKnown: true, hot: false });
    expect(parts.find((p) => p.key === "warehouse")!.failed.notKnown).toBe(false);
    expect(HANDOVER_NOT_KNOWN).toBe("Could not be read right now");
  });

  it("shows one figure not read beside one that was", () => {
    expect(read(line({ warehouseUpdatesWaiting: 1, warehouseUpdatesFailed: null }))).toEqual([
      "Warehouse updates to the jobs: 1 waiting · – failed",
      "Trucking updates to the jobs: 0 waiting · 0 failed",
    ]);
  });

  it("says what it counts, with each module's own stale limit", () => {
    expect(HANDOVER_LABEL).toBe("Hand-overs");
    expect(HANDOVER_HINT).toBe(
      "Updates the warehouse / Trucking owes these jobs that have waited too long (warehouse 30 min, Trucking 10 min) or failed for good: the job's dates and stamps may be behind.",
    );
    const [warehouse, trucking] = handoverParts(line({ warehouseUpdatesFailed: 1 }));
    expect(warehouse!.hint).toContain("30 min");
    expect(trucking!.hint).toContain("10 min");
    for (const p of [warehouse!, trucking!]) {
      expect(p.hint).toContain("failed for good");
      expect(p.hint).toContain("the job's dates and stamps may be behind");
    }
  });
});
