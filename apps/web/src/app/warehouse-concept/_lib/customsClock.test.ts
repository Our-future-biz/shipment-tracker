import { describe, expect, it } from "vitest";
import { customsDeadlineDue } from "./worklist";
import { customsChipText, customsClock, customsClockSort, customsDue, customsRegime, customsReleaseNote, movementCustomsClock } from "./customsClock";

const base = { customsMode: "SCP", customsStatus: "Under Customs Clearance", operationType: "LCL consolidation" };
const steps = (received: string | null, left: string | null = null) => ({
  steps: [
    { stage: "expected", label: "Expected", at: null, done: true },
    { stage: "received", label: "Received", at: received, done: !!received },
    { stage: "left", label: "Left", at: left, done: !!left },
  ],
});

describe("customs regime", () => {
  it("T1, RDT and bonded storage are under customs control until cleared", () => {
    expect(customsRegime({ ...base, customsMode: "T1" })).toBe("Transit T1");
    expect(customsRegime({ ...base, customsMode: "RDT" })).toBe("Temporary storage");
    expect(customsRegime({ ...base, operationType: "Cargo storage (bonded)" })).toBe("Customs warehouse");
    expect(customsRegime(base)).toBe("");
    expect(customsRegime({ ...base, customsMode: "T1", customsStatus: "Customs Cleared/Released" })).toBe("");
  });
});

describe("customs counter", () => {
  it("counts from the receipt day (day 1) to receipt + 90 days, the same as the server", () => {
    const c = customsClock({ regime: "Temporary storage", start: "2026-10-01", today: "2026-10-15" });
    expect(c).toMatchObject({ state: "ok", daysUnderControl: 15, deadline: "2026-12-30", daysLeft: 76 });
    expect(customsChipText(c)).toBe("76 days left");
    expect(customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2026-12-20" })).toMatchObject({ state: "warning", daysLeft: 10 });
    const over = customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2027-01-01" });
    expect(over.state).toBe("overdue");
    expect(customsChipText(over)).toBe("2 days overdue");
    expect(customsDue(over)).toBe(true);
    expect(customsChipText(customsClock({ regime: "Customs warehouse", start: "2026-10-01", today: "2026-10-15" }))).toBe("Day 15");
  });

  it("reads the receipt and leaving from the lifecycle, in Prague days", () => {
    // 23:30 UTC on 30 Sep is 1 Oct in Prague.
    const m = { ...base, customsMode: "RDT", lifecycle: steps("2026-09-30T23:30:00.000Z") };
    expect(movementCustomsClock(m, "2026-10-15")).toMatchObject({ startDate: "2026-10-01", daysUnderControl: 15 });
    expect(movementCustomsClock({ ...m, lifecycle: steps("2026-10-01", "2026-10-05T10:00:00Z") }, "2026-10-15")).toMatchObject({ state: "stopped", daysUnderControl: 5 });
    expect(movementCustomsClock({ ...m, lifecycle: steps(null) }, "2026-10-15").state).toBe("not_started");
    expect(customsReleaseNote(m, "2026-10-15")).toBe("temporary storage · day 15 · deadline 2026-12-30 (76 days left)");
    expect(customsReleaseNote({ ...base, lifecycle: steps("2026-10-01") }, "2026-10-15")).toBe("");
  });

  it("sorts the least time left first", () => {
    const a = customsClock({ regime: "Transit T1", start: "2026-07-01", today: "2026-10-15" });
    const b = customsClock({ regime: "Transit T1", start: "2026-10-01", today: "2026-10-15" });
    const none = customsClock({ regime: "", start: null, today: "2026-10-15" });
    expect([none, b, a].sort((x, y) => customsClockSort(x) - customsClockSort(y))).toEqual([a, b, none]);
  });
});

describe("Customs deadline chip of Positions", () => {
  it("matches positions with 10 days or fewer left, or overdue, still in the warehouse", () => {
    const m = (received: string, left: string | null = null) =>
      ({ ...base, customsMode: "T1", lifecycle: steps(received, left) }) as unknown as Parameters<typeof customsDeadlineDue>[0];
    expect(customsDeadlineDue(m("2026-10-01"), "2026-12-19")).toBe(false);
    expect(customsDeadlineDue(m("2026-10-01"), "2026-12-20")).toBe(true);
    expect(customsDeadlineDue(m("2026-07-01"), "2026-10-15")).toBe(true);
    expect(customsDeadlineDue(m("2026-07-01", "2026-09-01"), "2026-10-15")).toBe(false);
  });
});
