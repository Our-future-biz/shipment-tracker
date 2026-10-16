import { describe, expect, it } from "vitest";
import { kpiValueText, periodRange, periodText, pragueToday } from "./kpiPeriod";

const NOW = new Date("2026-10-14T22:30:00Z"); // already 15.10. in Prague

describe("Reports period", () => {
  it("uses Prague days for the presets", () => {
    expect(pragueToday(NOW)).toBe("2026-10-15");
    expect(periodRange("today", {}, NOW)).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(periodRange("7d", {}, NOW)).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(periodRange("30d", {}, NOW)).toEqual({ from: "2026-09-16", to: "2026-10-15" });
  });

  it("takes a custom range only when it can be used", () => {
    expect(periodRange("custom", { from: "2026-09-01", to: "2026-09-30" }, NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("custom", { from: "2026-09-30", to: "2026-09-01" }, NOW)).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(periodRange("custom", { from: "2024-01-01", to: "2026-09-01" }, NOW)).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(periodRange("custom", { from: "x" }, NOW)).toEqual({ from: "2026-10-09", to: "2026-10-15" });
  });

  it("writes the period and the values in plain words", () => {
    expect(periodText({ from: "2026-10-09", to: "2026-10-15" })).toBe("9.10.2026 – 15.10.2026 (7 days)");
    expect(periodText({ from: "2026-10-15", to: "2026-10-15" })).toBe("15.10.2026 (1 day)");
    expect(kpiValueText(null, "days")).toBe("");
    expect(kpiValueText(12.25, "%")).toBe("12.3 %");
    expect(kpiValueText(12500, "kg")).toBe("12 500 kg");
  });
});
