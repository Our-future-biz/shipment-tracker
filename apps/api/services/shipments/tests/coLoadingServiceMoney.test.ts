import { describe, expect, it } from "vitest";
import type { EarningsRow, SailingEarnings } from "../interfaces/interfaces";
import { cleanServiceMoney, earnedPerWmEur, moneyOfRow, serviceTrend, trendSailings, withFloor, type TrendInput } from "../lib/coLoadingServiceMoney";

const amount = (eur: number | null, czk = (eur ?? 0) * 25) => ({ czk, eur });
const row = (more: Partial<EarningsRow> = {}): EarningsRow => ({ shipmentId: "s", counted: true, moneyKnown: true, noSelling: false, missingCurrencies: [], freightTons: 4, beforeBox: amount(400), ...more }) as EarningsRow;

describe("a service's money settings (Council Outlay 14, B4)", () => {
  it("keeps the default box costs as a container's three costs, and stores none when no amount is given", () => {
    const set = cleanServiceMoney({ defaultBoxCosts: [{ kind: "ocean", amount: 2100, currency: "usd", note: " carrier's tariff " }], minEarningPerWm: 85.5 });
    expect(set).toEqual({
      money: {
        defaultBoxCosts: [
          { kind: "origin", amount: null, currency: "EUR", note: "" },
          { kind: "ocean", amount: 2100, currency: "USD", note: "carrier's tariff" },
          { kind: "destination", amount: null, currency: "EUR", note: "" },
        ],
        minEarningPerWm: 85.5,
      },
    });
    expect(cleanServiceMoney({ defaultBoxCosts: [{ kind: "ocean", amount: null, currency: "EUR", note: "" }], minEarningPerWm: null })).toEqual({ money: { defaultBoxCosts: null, minEarningPerWm: null } });
    expect(cleanServiceMoney({ defaultBoxCosts: null, minEarningPerWm: null })).toEqual({ money: { defaultBoxCosts: null, minEarningPerWm: null } });
  });

  it("refuses a cost that is none and a minimum that is no amount", () => {
    expect(cleanServiceMoney({ defaultBoxCosts: [{ kind: "ocean", amount: -1, currency: "EUR", note: "" }], minEarningPerWm: null })).toHaveProperty("error");
    expect(cleanServiceMoney({ defaultBoxCosts: [{ kind: "fuel", amount: 1, currency: "EUR", note: "" }], minEarningPerWm: null })).toHaveProperty("error");
    expect(cleanServiceMoney({ defaultBoxCosts: null, minEarningPerWm: 0 })).toHaveProperty("error");
    expect(cleanServiceMoney({ defaultBoxCosts: null, minEarningPerWm: 10.123 })).toHaveProperty("error");
  });

  it("reads a stored service's settings, and none from a service that has none", () => {
    expect(moneyOfRow({ defaultBoxCosts: null, minEarningPerWm: "85.50" })).toEqual({ defaultBoxCosts: null, minEarningPerWm: 85.5 });
    expect(moneyOfRow({})).toEqual({ defaultBoxCosts: null, minEarningPerWm: null });
  });

  it("marks the rows that earn less per W/M than the minimum, and none where that cannot be said", () => {
    expect(earnedPerWmEur(row())).toBe(100);
    expect(earnedPerWmEur(row({ freightTons: 0 }))).toBeNull();
    expect(earnedPerWmEur(row({ beforeBox: amount(null, 9000) }))).toBeNull();
    expect(earnedPerWmEur(row({ counted: false }))).toBeNull();
    const earnings = { rows: [row({ shipmentId: "low", beforeBox: amount(200) }), row({ shipmentId: "fine" }), row({ shipmentId: "unknown", moneyKnown: false })] } as SailingEarnings;
    const marked = withFloor(earnings, 80);
    expect(marked.rows.map((r) => [r.shipmentId, r.belowFloor ?? false])).toEqual([["low", true], ["fine", false], ["unknown", false]]);
    expect(marked).toMatchObject({ minEarningPerWm: 80, belowFloor: 1 });
    // A row with money left out, or not priced yet, would read as earning too little: no mark either way.
    const gaps = { rows: [row({ shipmentId: "rate", beforeBox: amount(200), missingCurrencies: ["USD"] }), row({ shipmentId: "unpriced", beforeBox: amount(-50), noSelling: true })] } as SailingEarnings;
    expect(earnedPerWmEur(gaps.rows[0]!)).toBeNull();
    expect(earnedPerWmEur(gaps.rows[1]!)).toBeNull();
    expect(withFloor(gaps, 80)).toMatchObject({ belowFloor: 0 });
    // No minimum: nothing is marked.
    expect(withFloor(earnings, null)).toMatchObject({ minEarningPerWm: null, belowFloor: 0 });
    expect(withFloor(earnings, null).rows.some((r) => r.belowFloor)).toBe(false);
  });
});

describe("a service's trend (Council Outlay 14, B5)", () => {
  const TODAY = "2026-11-24";
  type Money = { profit?: number | null; reached?: boolean | null; known?: boolean; complete?: boolean; notSet?: number[]; noSelling?: number; provisional?: boolean };
  const sailing = (n: number, more: Partial<TrendInput> = {}, money: Money = {}): TrendInput => ({
    sailingId: `s${n}`,
    name: `WEEK ${n}`,
    departureDate: `2026-${String(Math.ceil(n / 4)).padStart(2, "0")}-${String(((n - 1) % 4) * 7 + 1).padStart(2, "0")}`,
    stage: "open",
    createdAt: new Date(2026, 0, n),
    fullPct: 50 + n,
    earnings: {
      moneyKnown: money.known ?? true,
      complete: money.complete ?? true,
      totals: { profit: money.profit === null ? null : amount(money.profit ?? n * 100), marginPct: 10 },
      boxCosts: { set: money.profit !== null, notSet: money.notSet ?? [], ignoredContainers: [], rateProvisional: money.provisional ?? false, containers: [{ lines: [{ amount: 1000, currency: "USD" }] }] },
      notes: { noSelling: money.noSelling ?? 0 },
      breakEven: money.reached === null ? null : { reached: money.reached ?? true },
    } as unknown as SailingEarnings,
    ...more,
  });

  it("takes the last eight sailings that have left, the oldest first, and averages them", () => {
    const all = Array.from({ length: 10 }, (_, i) => sailing(i + 1));
    const trend = serviceTrend([...all, sailing(60, { departureDate: "2026-12-20" }), sailing(61, { departureDate: null })], TODAY);
    expect(trend.sailings.map((s) => s.name)).toEqual(["WEEK 3", "WEEK 4", "WEEK 5", "WEEK 6", "WEEK 7", "WEEK 8", "WEEK 9", "WEEK 10"]);
    expect(trend.averageFillPct).toBe(57);
    expect(trend.averageProfitEur).toBe(650);
    expect(trend).toMatchObject({ profitKnown: 8, belowBreakEven: 0, breakEvenKnown: 8 });
  });

  it("counts a sailing set to Departed by hand, whatever its date", () => {
    expect(serviceTrend([sailing(1, { departureDate: null, stage: "departed" }), sailing(2, { departureDate: "2026-12-20", stage: "arrived" })], TODAY).sailings).toHaveLength(2);
    expect(serviceTrend([sailing(1, { departureDate: "2026-12-20", stage: "closed" })], TODAY).sailings).toEqual([]);
  });

  it("leaves a figure that is not known out of its average, and counts those below break-even", () => {
    const trend = serviceTrend([sailing(1, {}, { profit: -200, reached: false }), sailing(2, {}, { profit: null, reached: null }), sailing(3, { fullPct: null }, { known: false }), sailing(4, {}, { profit: 400, reached: true })], TODAY);
    expect(trend.sailings.map((s) => [s.profitEur, s.belowBreakEven])).toEqual([[-200, true], [null, null], [null, false], [400, false]]);
    expect(trend.averageProfitEur).toBe(100);
    expect(trend.averageFillPct).toBe(52);
    expect(trend).toMatchObject({ profitKnown: 2, belowBreakEven: 1, breakEvenKnown: 3 });
  });

  it("counts a profit the list of sailings flags as incomplete as not known, and does not judge a box with a container uncosted", () => {
    const trend = serviceTrend(
      [
        sailing(1, {}, { profit: 900, complete: false }),
        sailing(2, {}, { profit: 900, notSet: [2], reached: true }),
        sailing(3, {}, { profit: -300, noSelling: 1, reached: false }),
        sailing(4, {}, { profit: 500 }),
      ],
      TODAY,
    );
    expect(trend.sailings.map((s) => [s.name, s.profitEur, s.marginPct, s.belowBreakEven])).toEqual([
      ["WEEK 1", null, null, false],
      ["WEEK 2", null, null, null],
      ["WEEK 3", null, null, true],
      ["WEEK 4", 500, 10, false],
    ]);
    expect(trend).toMatchObject({ averageProfitEur: 500, profitKnown: 1, breakEvenKnown: 3 });
  });

  it("counts a profit valued at a rate that may still move: the list shows it, with its mark", () => {
    expect(serviceTrend([sailing(1, {}, { profit: 700, provisional: true })], TODAY)).toMatchObject({ averageProfitEur: 700, profitKnown: 1 });
  });

  it("chooses the eight sailings before their money is worked out", () => {
    const all = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, departureDate: `2026-0${Math.ceil((i + 1) / 4)}-0${(i % 4) + 1}`, stage: "open", createdAt: new Date(2026, 0, i + 1) }));
    expect(trendSailings([...all, { id: 99, departureDate: "2026-12-20", stage: "open", createdAt: new Date() }], TODAY).map((s) => s.id)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("is empty for a service whose sailings are all still to come", () => {
    expect(serviceTrend([sailing(60, { departureDate: "2026-12-20" })], TODAY)).toEqual({ sailings: [], averageFillPct: null, averageProfitEur: null, profitKnown: 0, belowBreakEven: 0, breakEvenKnown: 0 });
  });
});
