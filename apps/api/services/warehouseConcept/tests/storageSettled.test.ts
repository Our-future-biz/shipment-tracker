import { describe, expect, it } from "vitest";
import { reopenedGates, storageLineToReopen, type StorageLineRecord } from "../services/storageSettled";
import { correctionNeeded } from "../services/correction";
import { isBareDischargeHow, leftPhysically } from "../services/warehouseStockPlan";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

const NOW = new Date("2026-10-23T10:00:00Z");
const rec = (over: Partial<StorageLineRecord> = {}): StorageLineRecord => ({
  visit: "výdej",
  handling: "Import",
  gateIn: null,
  gateOut: null,
  impRelease: null,
  leftAt: null,
  receivedAt: null,
  // Received 20 days ago: past the 7 free days.
  loadInDate: "2026-10-03",
  freeDays: null,
  measureCbm: 2,
  weightKg: 500,
  releaseGates: [
    { g: "Charges", s: "OK", note: "" },
    { g: "Storage settled", s: "OK", note: "within free time" },
  ],
  events: [],
  ...over,
});

describe("Storage settled back to Pending (decision 19)", () => {
  it("when outbound storage is chargeable and nobody ticked the line", () => {
    expect(storageLineToReopen(rec(), NOW)).toBe(true);
    expect(reopenedGates(rec().releaseGates)).toEqual([
      { g: "Charges", s: "OK", note: "" },
      { g: "Storage settled", s: "Pending", note: "storage chargeable — settle it before the release" },
    ]);
  });

  it("not within free time, not inbound, not released, not after a person's tick, and only once", () => {
    expect(storageLineToReopen(rec({ loadInDate: "2026-10-20" }), NOW)).toBe(false);
    expect(storageLineToReopen(rec({ visit: "příjem", handling: "Export" }), NOW)).toBe(false);
    // Domestic cargo (in → out) has a WH release too; its storage starts at the gate-in.
    expect(storageLineToReopen(rec({ handling: "Domestic", visit: "příjem", gateIn: new Date("2026-10-03T08:00:00Z") }), NOW)).toBe(true);
    expect(storageLineToReopen(rec({ impRelease: new Date("2026-10-22T08:00:00Z") }), NOW)).toBe(false);
    expect(storageLineToReopen(rec({ events: [{ kind: "releaseGate", label: "Storage settled: OK", at: "", by: "Eva" }] }), NOW)).toBe(false);
    expect(storageLineToReopen(rec({ events: [{ kind: "storageSettledReopened", label: "", at: "", by: "Warehouse" }] }), NOW)).toBe(false);
    expect(storageLineToReopen(rec({ releaseGates: [{ g: "Storage settled", s: "Pending", note: "" }] }), NOW)).toBe(false);
  });
});

describe("corrections and discharges (step 3)", () => {
  it("a correction stays open until a later Dismiss", () => {
    const at = "2026-10-20T08:00:00Z";
    expect(correctionNeeded([{ kind: "shipmentMayNeedCorrecting", label: "", at, by: "", detail: "x" }])).toEqual({ at, detail: "x" });
    expect(correctionNeeded([{ kind: "shipmentMayNeedCorrecting", label: "", at, by: "" }, { kind: "shipmentCorrectionDismissed", label: "", at, by: "" }])).toBeNull();
    expect(correctionNeeded([])).toBeNull();
  });

  it("a discharge reference that names only how the goods left may still get the document", () => {
    expect(isBareDischargeHow("WH release")).toBe(true);
    expect(isBareDischargeHow("Left in container TGHU 777 000-1")).toBe(true);
    expect(isBareDischargeHow("26CZ5100001234A7 · WH release")).toBe(false);
    expect(leftPhysically("2026-10-20 · WH release")).toBe(true);
    expect(leftPhysically("2026-10-20 · customs cleared/released")).toBe(false);
  });
});
