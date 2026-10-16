import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { periodRange } from "@/app/warehouse/_components/kpi/kpiPeriod";
import {
  affectedText,
  belowFloorText,
  claimsText,
  daysText,
  departmentLines,
  gapLaneLabel,
  isMarginView,
  marginRows,
  marginText,
  marginTotals,
  perKgText,
  reportFileName,
  sortDepartments,
  sortGaps,
  sortHauliers,
  sortKpis,
  tariffsHref,
  truckingKpiTone,
} from "./reports";

const kpi = (key: interfaces.TruckingKpi["key"], value: number | null = 1): interfaces.TruckingKpi => ({
  key,
  label: key,
  value,
  unit: "%",
  n: 1,
  measured: "",
  notMeasured: "",
  breakdown: [],
});

const row = (key: string, sellCzk: number, marginCzk: number, extra: Partial<interfaces.MarginRow> = {}): interfaces.MarginRow => ({
  key,
  label: key,
  consignments: 1,
  sellCzk,
  buyCzk: sellCzk - marginCzk,
  marginCzk,
  marginPercent: sellCzk ? (marginCzk / sellCzk) * 100 : null,
  belowFloor: 0,
  ...extra,
});

const haulier = (name: string, status: interfaces.HaulierStatus, trips: number): interfaces.HaulierScore => ({
  haulierCustomerId: name,
  name,
  trips,
  partnerLegs: 0,
  consignments: trips,
  onTimePercent: null,
  firstAttemptPercent: null,
  avgDaysToPod: null,
  claims: 0,
  claimedCzk: 0,
  costCzk: 0,
  costPerKg: null,
  invoicesBlocked: 0,
  invoiceDifferenceCzk: 0,
  status,
});

const gap = (postcode: string, count: number, lastAt: string, extra: Partial<interfaces.CoverageGap> = {}): interfaces.CoverageGap => ({
  side: "SELL",
  scope: "LTL",
  serviceLevel: "D1",
  postcode,
  reason: "No zone",
  count,
  lastAt,
  ...extra,
});

describe("KPIs", () => {
  it("are shown in the reading order, unknown keys last", () => {
    const sorted = sortKpis([kpi("avizaceDone"), kpi("margin"), kpi("onTime"), kpi("daysToPod")]);
    expect(sorted.map((k) => k.key)).toEqual(["onTime", "daysToPod", "margin", "avizaceDone"]);
  });

  it("are red for a negative margin and amber while PODs are missing", () => {
    expect(truckingKpiTone(kpi("margin", -2))).toBe("red");
    expect(truckingKpiTone(kpi("margin", 12))).toBeUndefined();
    expect(truckingKpiTone(kpi("podMissing", 3))).toBe("amber");
    expect(truckingKpiTone(kpi("podMissing", 0))).toBeUndefined();
    expect(truckingKpiTone(kpi("margin", null))).toBeUndefined();
  });
});

describe("margin", () => {
  const report = {
    marginByCustomer: [row("B", 100, 10), row("A", 500, -20), row("C", 100, 5)],
    marginByLane: [row("lane", 1, 1)],
    marginByServiceLevel: [row("+1 day", 1, 1)],
  };

  it("picks the view and puts the largest sell first, then the name", () => {
    expect(marginRows(report, "customer").map((r) => r.key)).toEqual(["A", "B", "C"]);
    expect(marginRows(report, "lane").map((r) => r.key)).toEqual(["lane"]);
    expect(marginRows(report, "serviceLevel").map((r) => r.key)).toEqual(["+1 day"]);
    expect(isMarginView("lane")).toBe(true);
    expect(isMarginView("haulier")).toBe(false);
  });

  it("says a loss in words, not only in colour", () => {
    expect(marginText(-1200)).toBe("−1 200 CZK (loss)");
    expect(marginText(1200)).toBe("1 200 CZK");
    expect(belowFloorText(2)).toBe("2 below floor");
    expect(belowFloorText(0)).toBe("");
  });

  it("totals a view, with no percent without sell", () => {
    const t = marginTotals([row("A", 400, 40, { belowFloor: 1 }), row("B", 100, -10)]);
    expect(t).toEqual({ consignments: 2, sellCzk: 500, buyCzk: 470, marginCzk: 30, marginPercent: 6, belowFloor: 1 });
    expect(marginTotals([]).marginPercent).toBeNull();
  });
});

describe("haulier scorecard", () => {
  it("lists blocked and warning hauliers first, then by trips and name", () => {
    const sorted = sortHauliers([haulier("Beta", "ok", 9), haulier("Alfa", "ok", 9), haulier("Gama", "blocked", 1), haulier("Delta", "warning", 2)]);
    expect(sorted.map((h) => h.name)).toEqual(["Gama", "Delta", "Alfa", "Beta"]);
  });

  it("formats days, cost per kg and claims", () => {
    expect(daysText(1)).toBe("1 day");
    expect(daysText(2.5)).toBe("2.5 days");
    expect(daysText(null)).toBe("—");
    expect(perKgText(3.25)).toBe("3.25 CZK/kg");
    expect(perKgText(null)).toBe("—");
    expect(claimsText(2, 4500)).toBe("2 · 4 500 CZK");
    expect(claimsText(0, 0)).toBe("—");
  });
});

describe("coverage gaps", () => {
  const levelLabel = (code: string) => (code === "D1" ? "+1 day" : code);

  it("name the lane by postcode, scope and service level", () => {
    expect(gapLaneLabel(gap("60200", 1, ""), levelLabel)).toBe("602 00 · LTL · +1 day");
    expect(gapLaneLabel(gap("60200", 1, "", { scope: "LINEHAUL", serviceLevel: null }), levelLabel)).toBe("602 00 · Line haul");
  });

  it("are listed most asked first, then the latest", () => {
    const sorted = sortGaps([gap("1", 2, "2026-10-01T10:00:00Z"), gap("2", 5, "2026-09-01T10:00:00Z"), gap("3", 2, "2026-10-02T10:00:00Z")]);
    expect(sorted.map((g) => g.postcode)).toEqual(["2", "3", "1"]);
  });

  it("open the Tariffs tab on their side", () => {
    expect(tariffsHref("BUY")).toBe("/trucking?tab=tariffs&side=buy");
    expect(tariffsHref("INTERNAL")).toBe("/trucking?tab=tariffs&side=internal");
  });
});

describe("department result", () => {
  it("reads external sell + charged exceptions + internal charges − haulier cost", () => {
    const lines = departmentLines({ externalSellCzk: 100, exceptionChargesCzk: 20, internalChargesCzk: 50, haulierCostCzk: 120, resultCzk: 50, internalByDepartment: [] });
    expect(lines.map((l) => `${l.sign}${l.label}:${l.amountCzk}`)).toEqual(["+External sell:100", "+Charged exceptions:20", "+Internal charges:50", "−Haulier cost:120"]);
  });

  it("lists the departments largest first", () => {
    const sorted = sortDepartments([
      { department: "Sea", amountCzk: 10, consignments: 1 },
      { department: "Air", amountCzk: 30, consignments: 2 },
    ]);
    expect(sorted.map((d) => d.department)).toEqual(["Air", "Sea"]);
  });
});

describe("period and export", () => {
  it("uses the Reports period presets and names the export by its days", () => {
    const range = periodRange("7d", {}, new Date("2026-10-15T10:00:00Z"));
    expect(range).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(reportFileName(range)).toBe("trucking-report-2026-10-09-2026-10-15.xlsx");
  });
});

describe("tariff change", () => {
  it("says how many open quotes and consignments it touches", () => {
    expect(affectedText(null, null)).toBeNull();
    expect(affectedText(0, 0)).toBe("No open quote or consignment is priced with this tariff.");
    expect(affectedText(3, 1)).toBe("3 open quotes and 1 open consignment are priced with this tariff.");
    expect(affectedText(1, null)).toBe("1 open quote is priced with this tariff.");
  });
});
