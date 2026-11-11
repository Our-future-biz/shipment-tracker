import { describe, expect, it } from "vitest";
import { periodAveragesOf } from "./usePeriodAverages";

const year2026 = {
  year: 2026,
  currencies: ["EUR"],
  periods: [
    { type: "month" as const, key: "2026-10", from: "2026-10-01", to: "2026-10-31", final: true, averages: [{ currency: "EUR", average: 24.5, amount: 1, quoted: 24.5, fixingDays: 22 }] },
    { type: "quarter" as const, key: "2026-Q4", from: "2026-10-01", to: "2026-12-31", final: false, averages: [{ currency: "EUR", average: 24.4, amount: 1, quoted: 24.4, fixingDays: 30 }] },
  ],
};

describe("periodAveragesOf", () => {
  it("holds each month's averages", () => {
    const avg = periodAveragesOf([{ data: year2026, isLoading: false, isError: false }]);
    expect(avg.rates.get("2026-10")).toEqual({ EUR: 24.5 });
    expect(avg.final.get("2026-10")).toBe(true);
    expect(avg.rates.has("2026-Q4")).toBe(false);
    expect(avg.isError).toBe(false);
  });

  it("says a year could not be read, so its months do not read as having no average", () => {
    const avg = periodAveragesOf([
      { data: year2026, isLoading: false, isError: false },
      { isLoading: false, isError: true },
    ]);
    expect(avg.isError).toBe(true);
    expect(avg.loading).toBe(false);
  });

  it("keeps the averages of a year read before when reading it again fails", () => {
    const avg = periodAveragesOf([{ data: year2026, isLoading: false, isError: true }]);
    expect(avg.isError).toBe(false);
    expect(avg.rates.get("2026-10")).toEqual({ EUR: 24.5 });
  });
});
