import { describe, expect, it } from "vitest";
import { customsClock, customsClockSort, customsDeadline, customsRegime } from "../services/warehouseStockCustoms";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

const base = { customsMode: "SCP", customsStatus: "Under Customs Clearance", operationType: "LCL consolidation" };

describe("customs regime", () => {
  it("counts T1, RDT and bonded storage as under customs control, until cleared", () => {
    expect(customsRegime({ ...base, customsMode: "T1" })).toBe("Transit T1");
    expect(customsRegime({ ...base, customsMode: "RDT" })).toBe("Temporary storage");
    expect(customsRegime({ ...base, operationType: "Cargo storage (bonded)" })).toBe("Customs warehouse");
    expect(customsRegime(base)).toBe("");
    expect(customsRegime({ ...base, customsMode: "ATA Carnet" })).toBe("");
    expect(customsRegime({ ...base, customsMode: "T1", customsStatus: "Customs Cleared/Released" })).toBe("");
  });
});

describe("90-day counter (UCC art. 149)", () => {
  it("deadline = receipt day + 90 days; the receipt day is day 1", () => {
    expect(customsDeadline("Temporary storage", "2026-01-01")).toBe("2026-04-01");
    expect(customsDeadline("Transit T1", "2026-10-15")).toBe("2027-01-13");
    // A customs warehouse (procedure 71) has no 90-day limit.
    expect(customsDeadline("Customs warehouse", "2026-10-15")).toBe("");

    const c = customsClock({ regime: "Temporary storage", start: "2026-10-01", today: "2026-10-15" });
    expect(c).toMatchObject({ state: "ok", daysUnderControl: 15, deadline: "2026-12-30", daysLeft: 76 });
    expect(c.note).toBe("temporary storage · day 15 · deadline 2026-12-30 (76 days left)");
  });

  it("warns with 10 days left or fewer, and is overdue after the deadline", () => {
    expect(customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2026-12-19" })).toMatchObject({ state: "ok", daysLeft: 11 });
    expect(customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2026-12-20" })).toMatchObject({ state: "warning", daysLeft: 10 });
    const today = customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2026-12-30" });
    expect(today).toMatchObject({ state: "warning", daysLeft: 0 });
    expect(today.note).toContain("deadline today");
    const over = customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2027-01-02" });
    expect(over).toMatchObject({ state: "overdue", daysLeft: -3 });
    expect(over.note).toContain("3 days overdue");
  });

  it("stops when the cargo left or was cleared; not started before the receipt; none without control", () => {
    expect(customsClock({ regime: "Temporary storage", start: "2026-10-01", stop: "2026-10-10", today: "2026-12-31" })).toMatchObject({
      state: "stopped",
      daysUnderControl: 10,
      stopDate: "2026-10-10",
    });
    expect(customsClock({ regime: "Temporary storage", start: null, today: "2026-10-15" }).state).toBe("not_started");
    expect(customsClock({ regime: "", start: "2026-10-01", today: "2026-10-15" })).toMatchObject({ state: "none", note: "" });
    const cw = customsClock({ regime: "Customs warehouse", start: "2026-01-01", today: "2026-10-15" });
    expect(cw).toMatchObject({ state: "ok", deadline: "", daysLeft: null });
    expect(cw.note).toContain("no 90-day limit");
  });

  it("sorts the least time left first", () => {
    const a = customsClock({ regime: "Transit T1", start: "2026-07-01", today: "2026-10-15" }); // overdue
    const b = customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2026-10-15" });
    const none = customsClock({ regime: "", start: null, today: "2026-10-15" });
    expect([none, b, a].sort((x, y) => customsClockSort(x) - customsClockSort(y))).toEqual([a, b, none]);
  });
});
