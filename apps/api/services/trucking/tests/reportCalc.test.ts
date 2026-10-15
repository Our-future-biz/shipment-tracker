import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  avizaceDoneKpi,
  buildKpis,
  costPerKgKpi,
  costPerPalletKpi,
  czkOf,
  daysToPodKpi,
  departmentResult,
  exceptionRateKpi,
  firstAttemptKpi,
  haulierScores,
  laneLabel,
  lineHaulFillKpi,
  marginKpi,
  marginTables,
  onTimeKpi,
  podMissingKpi,
  resolvePeriod,
  weightedPercentile,
  workingDaysBetween,
  type DeliveredGroup,
  type HaulierInput,
} from "../lib/reportCalc";

const group = (over: Partial<DeliveredGroup> = {}): DeliveredGroup => ({
  scope: "LTL",
  serviceLevel: "D1",
  internal: false,
  delivered: 0,
  customerFailed: 0,
  noPromise: 0,
  onTime: 0,
  failed: 0,
  avizaceNeeded: 0,
  avizaceBefore: 0,
  costed: 0,
  costReal: 0,
  costCzk: 0,
  costKg: 0,
  pallets: 0,
  palletCostCzk: 0,
  margined: 0,
  marginSellCzk: 0,
  marginBuyCzk: 0,
  belowFloor: 0,
  sellCzk: 0,
  ...over,
});

const labels = new Map([
  ["D1", "+1 day"],
  ["D2", "+2 days"],
]);
const part = (k: { breakdown: { label: string }[] }, label: string) => k.breakdown.find((b) => b.label === label);

describe("period", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  it("defaults to the last 7 days to today (Prague)", () => {
    expect(resolvePeriod(undefined, undefined, now)).toEqual({ from: "2026-10-09", to: "2026-10-15" });
  });
  it("refuses a period that starts after it ends, is longer than 366 days or has no real dates", () => {
    expect(resolvePeriod("2026-10-10", "2026-10-01", now)).toEqual({ error: "The period starts after it ends" });
    expect(resolvePeriod("2025-10-14", "2026-10-15", now)).toEqual({ error: "The period can be at most 366 days" });
    expect(resolvePeriod("2026-02-31", "2026-03-01", now)).toEqual({ error: "The period needs dates as YYYY-MM-DD" });
  });
  it("accepts exactly 366 days and a single day", () => {
    expect(resolvePeriod("2025-10-15", "2026-10-15", now)).toEqual({ from: "2025-10-15", to: "2026-10-15" });
    expect(resolvePeriod("2026-10-15", "2026-10-15", now)).toEqual({ from: "2026-10-15", to: "2026-10-15" });
  });
});

describe("working days and percentiles", () => {
  it("counts working days after the first day up to the last, holidays left out", () => {
    expect(workingDaysBetween("2026-10-23", "2026-10-27")).toBe(2); // Fri → Tue: Mon, Tue
    expect(workingDaysBetween("2026-10-27", "2026-10-29")).toBe(1); // 28 Oct is a holiday
    expect(workingDaysBetween("2026-10-27", "2026-10-29", ["2026-10-29"])).toBe(0);
    expect(workingDaysBetween("2026-10-27", "2026-10-27")).toBe(0);
    expect(workingDaysBetween("2026-10-27", "2026-10-20")).toBe(0);
  });
  it("takes the nearest-rank percentile of counted values", () => {
    expect(weightedPercentile([{ value: 1, n: 9 }, { value: 5, n: 1 }], 90)).toBe(1);
    expect(weightedPercentile([{ value: 1, n: 8 }, { value: 5, n: 2 }], 90)).toBe(5);
    expect(weightedPercentile([], 90)).toBeNull();
  });
  it("converts EUR at the rate of its day, CZK as it is, and nothing without a rate", () => {
    const eur = new Map([["2026-10-01", 25], ["2026-10-02", null]]);
    expect(czkOf(10, "EUR", "2026-10-01", eur)).toBe(250);
    expect(czkOf(10, "CZK", "2026-10-02", eur)).toBe(10);
    expect(czkOf(10, "EUR", "2026-10-02", eur)).toBeNull();
  });
});

describe("on time", () => {
  it("counts delivered on or before the final promise, leaves out customer-caused failures and consignments without a promise", () => {
    const k = onTimeKpi(
      [
        group({ scope: "FTL", serviceLevel: "D1", delivered: 10, customerFailed: 1, noPromise: 1, onTime: 6 }),
        group({ scope: "LTL", serviceLevel: "D2", delivered: 5, noPromise: 1, onTime: 4 }),
      ],
      labels,
    );
    expect(k).toMatchObject({ key: "onTime", value: 83.3, unit: "%", n: 12 });
    expect(k.notMeasured).toContain("1 with a failed delivery caused by the customer are left out");
    expect(k.notMeasured).toContain("2 without a final promised date");
    expect(part(k, "Late")).toMatchObject({ value: 2, n: 12 });
    expect(part(k, "FTL")).toMatchObject({ value: 75, n: 8 });
    expect(part(k, "LTL")).toMatchObject({ value: 100, n: 4 });
    expect(part(k, "+1 day")).toMatchObject({ value: 75 });
    expect(part(k, "+2 days")).toMatchObject({ value: 100 });
  });

  it("is null with the reason when nothing was delivered, or nothing had a final promise", () => {
    expect(onTimeKpi([], labels)).toMatchObject({ value: null, n: 0, notMeasured: "No consignment delivered in this period" });
    const none = onTimeKpi([group({ serviceLevel: "", delivered: 2, noPromise: 2 })], labels);
    expect(none.value).toBeNull();
    expect(none.notMeasured).toContain("No delivered consignment had a final promised date");
    expect(part(none, "No service level")).toMatchObject({ value: null, n: 0 });
    expect(part(none, "FTL")).toMatchObject({ value: null, n: 0 });
  });
});

describe("first attempt", () => {
  it("is delivered without a failed delivery ÷ delivered, with the failed reasons", () => {
    const k = firstAttemptKpi([group({ delivered: 8, failed: 2 })], [
      { reason: "ABSENT", n: 1 },
      { reason: "CLOSED", n: 2 },
    ]);
    expect(k).toMatchObject({ value: 75, n: 8 });
    expect(k.breakdown.map((b) => [b.label, b.value])).toEqual([
      ["Failed at least once", 2],
      ["Closed", 2],
      ["Nobody there", 1],
    ]);
    expect(firstAttemptKpi([], []).value).toBeNull();
  });
});

describe("days to POD and POD missing", () => {
  it("averages working days from delivered to POD, with the P90 and those still without POD", () => {
    const k = daysToPodKpi(
      [
        { deliveredDay: "2026-10-23", podDay: "2026-10-27", haulierId: "h1", n: 3 }, // 2 working days
        { deliveredDay: "2026-10-27", podDay: "2026-10-29", haulierId: "h1", n: 1 }, // 1 (28 Oct holiday)
      ],
      6,
      [],
    );
    expect(k).toMatchObject({ value: 1.8, unit: "working days", n: 4 });
    expect(part(k, "P90")).toMatchObject({ value: 2, n: 4 });
    expect(part(k, "Without POD yet")).toMatchObject({ value: 2 });
    expect(k.notMeasured).toBe("2 delivered without a POD yet are not counted");
    expect(daysToPodKpi([], 0, [])).toMatchObject({ value: null, notMeasured: "No consignment delivered in this period has its POD yet" });
  });

  it("counts delivered more than 2 working days ago without POD, now, per haulier", () => {
    const k = podMissingKpi(
      [
        { deliveredDay: "2026-10-26", haulierId: "h1", haulierName: "Trip name", n: 2 }, // +2 wd = 29 Oct < 30 Oct
        { deliveredDay: "2026-10-27", haulierId: "h2", haulierName: null, n: 5 }, // +2 wd = 30 Oct: not yet
        { deliveredDay: "2026-09-01", haulierId: null, haulierName: null, n: 1 },
      ],
      "2026-10-30",
      [],
      new Map([["h1", "Alfa s.r.o."]]),
    );
    expect(k).toMatchObject({ key: "podMissing", value: 3, n: 3, notMeasured: "" });
    expect(k.breakdown.map((b) => [b.label, b.value])).toEqual([
      ["Alfa s.r.o.", 2],
      ["No haulier", 1],
    ]);
    // A company holiday pushes the deadline out.
    expect(podMissingKpi([{ deliveredDay: "2026-10-26", haulierId: "h1", haulierName: null, n: 2 }], "2026-10-30", ["2026-10-29"], new Map()).value).toBe(0);
  });
});

describe("fill", () => {
  it("averages the fuller of LDM and kg against the vehicle, per kind; trips without a vehicle are not counted", () => {
    const k = lineHaulFillKpi([
      { kind: "LINEHAUL", capacity: { ldm: 13.6, kg: 24000 }, ldm: 6.8, kg: 6000 }, // 50 %
      { kind: "LINEHAUL", capacity: { ldm: 13.6, kg: 24000 }, ldm: 3.4, kg: 18000 }, // 75 %
      { kind: "DELIVERY_RUN", capacity: { ldm: 7, kg: 3500 }, ldm: 7, kg: 1000 }, // 100 %
      { kind: "DELIVERY_RUN", capacity: null, ldm: 1, kg: 100 },
    ]);
    expect(k).toMatchObject({ value: 75, n: 3, notMeasured: "1 trip(s) without a vehicle type are not counted" });
    expect(part(k, "Line haul")).toMatchObject({ value: 62.5, n: 2 });
    expect(part(k, "Delivery run")).toMatchObject({ value: 100, n: 1 });
    expect(lineHaulFillKpi([])).toMatchObject({ value: null, notMeasured: "No line haul or delivery run departed in this period" });
  });
});

describe("cost per kg and per pallet place", () => {
  it("divides the haulier cost by the chargeable kg, real and estimate counted apart", () => {
    const groups = [
      group({ scope: "FTL", delivered: 2, costed: 2, costReal: 2, costCzk: 20000, costKg: 10000 }),
      group({ scope: "LTL", delivered: 4, costed: 3, costReal: 1, costCzk: 3000, costKg: 1000, pallets: 4, palletCostCzk: 2000 }),
    ];
    const k = costPerKgKpi(groups);
    expect(k).toMatchObject({ value: 2.09, unit: "CZK/kg", n: 5, notMeasured: "1 delivered without any haulier cost are not counted" });
    expect(part(k, "FTL")).toMatchObject({ value: 2 });
    expect(part(k, "LTL")).toMatchObject({ value: 3 });
    expect(part(k, "Real cost (approved invoice)")).toMatchObject({ value: 3 });
    expect(part(k, "Estimate")).toMatchObject({ value: 2 });
    const p = costPerPalletKpi(groups);
    expect(p).toMatchObject({ value: 500, unit: "CZK/pallet place", n: 4 });
    expect(part(p, "FTL")).toMatchObject({ value: null });
    expect(costPerKgKpi([group({ delivered: 1 })]).value).toBeNull();
    expect(costPerPalletKpi([]).value).toBeNull();
  });
});

describe("margin", () => {
  it("is Σ(sell − buy) ÷ Σ sell of Road consignments; internal ones and the unpriced are left out", () => {
    const k = marginKpi([
      group({ delivered: 5, margined: 4, marginSellCzk: 10000, marginBuyCzk: 8500, belowFloor: 1, sellCzk: 10000 }),
      group({ internal: true, delivered: 3, margined: 0 }),
    ]);
    expect(k).toMatchObject({ value: 15, n: 4 });
    expect(part(k, "Margin")).toMatchObject({ value: 1500, unit: "CZK" });
    expect(part(k, "Below the floor")).toMatchObject({ value: 1 });
    expect(part(k, "Internal (left out)")).toMatchObject({ value: 3 });
    expect(part(k, "Not priced")).toMatchObject({ value: 1 });
    expect(marginKpi([group({ internal: true, delivered: 3 })]).value).toBeNull();
  });

  it("builds the tables per customer, lane (with zones) and service level, biggest sell first", () => {
    const zoneOf = (pc: string) => ({ "11000": "1", "60200": "4" })[pc] ?? null;
    const t = marginTables(
      [
        { dim: "customer", key: "c1", label: "TEST Odběratel Ostrava", consignments: 2, sellCzk: 1000, buyCzk: 1100, belowFloor: 2 },
        { dim: "customer", key: "c2", label: "Acme", consignments: 1, sellCzk: 5000, buyCzk: 4000, belowFloor: 0 },
        { dim: "lane", key: "11000>60200", label: "", consignments: 3, sellCzk: 6000, buyCzk: 5100, belowFloor: 2 },
        { dim: "lane", key: "11000>79001", label: "", consignments: 1, sellCzk: 10, buyCzk: 0, belowFloor: 0 },
        { dim: "serviceLevel", key: "D1", label: "", consignments: 3, sellCzk: 6000, buyCzk: 5100, belowFloor: 2 },
        { dim: "serviceLevel", key: "", label: "", consignments: 1, sellCzk: 0, buyCzk: 10, belowFloor: 1 },
      ],
      labels,
      zoneOf,
    );
    expect(t.marginByCustomer.map((r) => r.key)).toEqual(["c2", "c1"]);
    expect(t.marginByCustomer[1]).toEqual({ key: "c1", label: "TEST Odběratel Ostrava", consignments: 2, sellCzk: 1000, buyCzk: 1100, marginCzk: -100, marginPercent: -10, belowFloor: 2 });
    expect(t.marginByLane.map((r) => r.label)).toEqual(["110 00 → 602 00 (zones 1 → 4)", "110 00 → 790 01 (zones 1 → ?)"]);
    expect(t.marginByServiceLevel.map((r) => [r.label, r.marginPercent])).toEqual([
      ["+1 day", 15],
      ["No service level", null],
    ]);
    expect(laneLabel("11000>60200", () => null)).toBe("110 00 → 602 00");
  });
});

describe("exceptions and avizace", () => {
  it("counts exceptions created per 100 delivered, per kind and per decision", () => {
    const k = exceptionRateKpi(
      [
        { kind: "DAMAGE", decision: "CLAIM_HAULIER", n: 2 },
        { kind: "DAMAGE", decision: "PENDING", n: 1 },
        { kind: "FAILED_DELIVERY", decision: "CHARGE_CUSTOMER", n: 1 },
      ],
      50,
    );
    expect(k).toMatchObject({ value: 8, n: 4 });
    expect(part(k, "Damage")).toMatchObject({ value: 6, n: 3 });
    expect(part(k, "Failed delivery")).toMatchObject({ value: 2, n: 1 });
    expect(part(k, "Claimed from the haulier")).toMatchObject({ value: 2 });
    expect(exceptionRateKpi([{ kind: "OTHER", decision: "PENDING", n: 1 }], 0)).toMatchObject({ value: null, notMeasured: "No consignment delivered in this period (1 exception(s) created)" });
  });

  it("shares the avizace recorded before delivery among those that needed one", () => {
    const k = avizaceDoneKpi([group({ delivered: 10, avizaceNeeded: 4, avizaceBefore: 3 })]);
    expect(k).toMatchObject({ value: 75, n: 4 });
    expect(part(k, "Missing or late")).toMatchObject({ value: 1 });
    expect(avizaceDoneKpi([group({ delivered: 3 })])).toMatchObject({ value: null, notMeasured: "No consignment delivered in this period needed an avizace" });
  });

  it("gives the ten KPIs in the contract's order", () => {
    const kpis = buildKpis(
      { delivered: [], podPairs: [], podOpen: [], fillTrips: [], exceptions: [], failedReasons: [], holidays: [], levelLabels: labels, haulierNames: new Map() },
      "2026-10-15",
    );
    expect(kpis.map((k) => k.key)).toEqual(["onTime", "firstAttempt", "daysToPod", "podMissing", "lineHaulFill", "costPerKg", "costPerPallet", "margin", "exceptionRate", "avizaceDone"]);
    expect(kpis.filter((k) => k.value === null).every((k) => k.notMeasured !== "")).toBe(true);
  });
});

describe("haulier scorecard", () => {
  const input = (over: Partial<HaulierInput> = {}): HaulierInput => ({
    perf: [{ haulierId: "h1", haulierName: "From trip", delivered: 4, measured: 3, onTime: 2, failed: 1 }],
    costs: [
      { haulierId: "h1", haulierName: "From trip", trips: 2, partnerLegs: 0, consignments: 5, costCzk: 9000, costKg: 3000 },
      // A partner that only delivered (no trip of its own)
      { haulierId: "h2", haulierName: null, trips: 0, partnerLegs: 1, consignments: 1, costCzk: 500, costKg: 0 },
    ],
    podPairs: [{ deliveredDay: "2026-10-23", podDay: "2026-10-27", haulierId: "h1", n: 2 }],
    claims: [
      { haulierId: "h1", currency: "CZK", day: "2026-10-05", n: 1, amount: 1000 },
      { haulierId: "h1", currency: "EUR", day: "2026-10-06", n: 1, amount: 10 },
    ],
    invoicesBlocked: [{ haulierId: "h3", n: 2 }],
    invoiceDifferences: [{ haulierId: "h1", currency: "CZK", day: "2026-10-07", n: 2, amount: 120 }],
    holidays: [],
    eur: new Map([["2026-10-06", 25]]),
    names: new Map([["h1", "Alfa s.r.o."]]),
    statuses: new Map([
      ["h1", "ok"],
      ["h2", "warning"],
    ]),
    ...over,
  });

  it("scores each haulier on its deliveries, costs, claims and invoices", () => {
    const [h1, h2, h3] = haulierScores(input());
    expect(h1).toEqual({
      haulierCustomerId: "h1",
      name: "Alfa s.r.o.",
      trips: 2,
      partnerLegs: 0,
      consignments: 5,
      onTimePercent: 66.7,
      firstAttemptPercent: 75,
      avgDaysToPod: 2,
      claims: 2,
      claimedCzk: 1250,
      costCzk: 9000,
      costPerKg: 3,
      invoicesBlocked: 0,
      invoiceDifferenceCzk: 120,
      status: "ok",
    });
    expect(h2).toMatchObject({ haulierCustomerId: "h2", name: "Unknown haulier", trips: 0, partnerLegs: 1, onTimePercent: null, avgDaysToPod: null, costPerKg: null, status: "warning" });
    // Only a blocked invoice: no profile status known → blocked (as a haulier without a profile)
    expect(h3).toMatchObject({ haulierCustomerId: "h3", trips: 0, partnerLegs: 0, consignments: 0, invoicesBlocked: 2, status: "blocked" });
  });

  it("leaves an EUR claim without a ČNB rate out of the CZK sum", () => {
    expect(haulierScores(input({ eur: new Map() }))[0]!.claimedCzk).toBe(1000);
  });
});

describe("department result", () => {
  it("is external sell + internal charges − all haulier cost, with the internal charges per department", () => {
    const d = departmentResult(
      [group({ sellCzk: 50000, costCzk: 30000 }), group({ internal: true, sellCzk: 0, costCzk: 8000 })],
      [
        { department: "Air", amountCzk: 3000, consignments: 2 },
        { department: "Sea", amountCzk: 9000.5, consignments: 3 },
      ],
    );
    expect(d).toEqual({
      externalSellCzk: 50000,
      internalChargesCzk: 12000.5,
      haulierCostCzk: 38000,
      resultCzk: 24000.5,
      internalByDepartment: [
        { department: "Sea", amountCzk: 9000.5, consignments: 3 },
        { department: "Air", amountCzk: 3000, consignments: 2 },
      ],
    });
  });

  it("counts an adjustment that takes a charge back (negative amount)", () => {
    expect(departmentResult([], [{ department: "Air", amountCzk: -500, consignments: 0 }])).toMatchObject({ internalChargesCzk: -500, resultCzk: -500 });
  });
});
