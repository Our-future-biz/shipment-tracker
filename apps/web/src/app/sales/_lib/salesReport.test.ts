import { describe, expect, it } from "vitest";
import { hitRate, inMonthRange, percentText, reportMonthOf, tileCzk, weightedMargin } from "./salesReport";

describe("weightedMargin", () => {
  it("is the profit over the selling of all quotes, not the mean of their margins", () => {
    // A small quote at 60 % and a large one at about 4 %: the mean would say 32 %.
    expect(weightedMargin([{ selling: 1_000, profit: 600 }, { selling: 99_000, profit: 4_400 }])).toBe(5);
  });

  it("leaves out quotes without CZK figures, as the sums do", () => {
    expect(weightedMargin([null, { selling: 10_000, profit: 2_500 }])).toBe(25);
  });

  it("lets a quote without selling weigh nothing", () => {
    expect(weightedMargin([{ selling: 0, profit: 0 }, { selling: 4_000, profit: 1_000 }])).toBe(25);
  });

  it("is a loss when profit is below zero", () => {
    expect(weightedMargin([{ selling: 10_000, profit: -1_500 }])).toBe(-15);
  });

  it("is nothing when nothing is sold", () => {
    expect(weightedMargin([])).toBeNull();
    expect(weightedMargin([null, { selling: 0, profit: 0 }])).toBeNull();
  });
});

describe("hitRate", () => {
  it("is won over won and lost", () => {
    expect(hitRate(6, 0)).toBe(100);
    expect(hitRate(1, 2)).toBe(33);
  });

  it("is nothing while no quote is won or lost", () => {
    expect(hitRate(0, 0)).toBeNull();
  });
});

describe("percentText", () => {
  it("is the percentage, or a dash for none", () => {
    expect(percentText(12)).toBe("12%");
    expect(percentText(null)).toBe("—");
  });
});

describe("inMonthRange", () => {
  it("includes both ends", () => {
    expect(inMonthRange("2026-01", ["2026-01", "2026-11"])).toBe(true);
    expect(inMonthRange("2026-11", ["2026-01", "2026-11"])).toBe(true);
    expect(inMonthRange("2026-06", ["2026-01", "2026-11"])).toBe(true);
  });

  it("leaves out the months before and after, and a quote without a month", () => {
    expect(inMonthRange("2025-12", ["2026-01", "2026-11"])).toBe(false);
    expect(inMonthRange("2026-12", ["2026-01", "2026-11"])).toBe(false);
    expect(inMonthRange("", ["2026-01", "2026-11"])).toBe(false);
  });
});

describe("reportMonthOf", () => {
  it("is the Prague month the quote was sent in, not the UTC one", () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Prague (CET).
    expect(reportMonthOf({ data: { sentAt: "2026-10-31T23:30:00.000Z" }, createdAt: "2026-10-02T08:00:00.000Z" })).toBe("2026-11");
    // And 22:30 UTC on 31 July is 00:30 on 1 August (CEST).
    expect(reportMonthOf({ data: { sentAt: "2026-07-31T22:30:00.000Z" }, createdAt: "2026-07-02T08:00:00.000Z" })).toBe("2026-08");
    expect(reportMonthOf({ data: { sentAt: "2026-10-31T22:30:00.000Z" }, createdAt: "2026-10-02T08:00:00.000Z" })).toBe("2026-10");
  });

  it("is the month it was created in when it was never sent", () => {
    expect(reportMonthOf({ data: {}, createdAt: "2026-12-31T23:15:00.000Z" })).toBe("2027-01");
  });

  it("is nothing for a quote without either", () => {
    expect(reportMonthOf({ data: {}, createdAt: "" })).toBe("");
  });
});

describe("tileCzk", () => {
  it("is whole crowns in the tile, the exact sum on hover (User Council S23)", () => {
    expect(tileCzk(181969.03)).toEqual({ value: "181,969 CZK", exact: "181,969.03 CZK" });
    expect(tileCzk(0)).toEqual({ value: "—" });
  });
});
