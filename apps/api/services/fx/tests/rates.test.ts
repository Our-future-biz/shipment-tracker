import { describe, expect, it } from "vitest";
import { applyRoe, averageByCurrency, periodsOfYear, resolveFixing, type Fixing } from "../lib/rates";
import { expectedLatestFixing, isCzechHoliday, isFixingDay, pragueToday, previousFixingDay, previousWeekday } from "../lib/dates";
import { parseRates, publicImportError } from "../lib/cnb";

const eur = (validDate: string, rate: number): Fixing => ({ validDate, currency: "EUR", amount: 1, rate });

describe("resolveFixing", () => {
  // Thu 8 Oct, Fri 9 Oct, Mon 12 Oct 2026
  const rows = [eur("2026-10-08", 24.3), eur("2026-10-09", 24.365), eur("2026-10-12", 24.4)];

  it("uses the day's own fixing", () => {
    expect(resolveFixing(rows, "2026-10-09", "2026-10-12")).toEqual({
      rate: 24.365, fixingDate: "2026-10-09", carried: false, provisional: false, missing: false,
    });
  });

  it("carries Friday's fixing over the weekend, final", () => {
    expect(resolveFixing(rows, "2026-10-11", "2026-10-12")).toMatchObject({ fixingDate: "2026-10-09", carried: true, provisional: false, missing: false });
  });

  it("marks today before publication as provisional", () => {
    // before the 15:00 pull the newest fixing expected is Monday's
    expect(resolveFixing(rows, "2026-10-13", "2026-10-12")).toMatchObject({ fixingDate: "2026-10-12", carried: true, provisional: true, missing: false });
  });

  it("marks a fixing that should be stored but isn't as missing — never final", () => {
    // Tuesday's import failed: on Wednesday afternoon a Tuesday date has only Monday's fixing
    expect(resolveFixing(rows, "2026-10-13", "2026-10-14")).toMatchObject({ fixingDate: "2026-10-12", provisional: false, missing: true });
    expect(resolveFixing(rows, "2026-10-14", "2026-10-14")).toMatchObject({ missing: true });
  });

  it("carries a fixing over a Czech public holiday as final", () => {
    // Wed 28 Oct 2026 is a public holiday: Tuesday's fixing is the rate, nothing is missing
    const tue = [eur("2026-10-27", 24.6)];
    expect(resolveFixing(tue, "2026-10-28", "2026-10-30")).toMatchObject({ fixingDate: "2026-10-27", provisional: false, missing: false });
  });

  it("marks a future weekday as provisional, a weekend right after a fixing as final", () => {
    expect(resolveFixing(rows, "2026-10-20", "2026-10-12")).toMatchObject({ provisional: true, missing: false });
    const friday = [eur("2026-10-16", 24.5)];
    expect(resolveFixing(friday, "2026-10-17", "2026-10-16")).toMatchObject({ fixingDate: "2026-10-16", provisional: false });
  });

  it("returns null before the first fixing — never a rate of 1", () => {
    expect(resolveFixing(rows, "2026-01-01", "2026-10-14")).toBeNull();
  });

  it("divides by the quoted amount (JPY per 100)", () => {
    const jpy: Fixing[] = [{ validDate: "2026-10-09", currency: "JPY", amount: 100, rate: 15.4 }];
    expect(resolveFixing(jpy, "2026-10-09", "2026-10-14")?.rate).toBeCloseTo(0.154, 6);
  });
});

describe("applyRoe", () => {
  it("adds the buffer to an already converted amount", () => {
    expect(applyRoe(1000 * 24.4, 102)).toBeCloseTo(24888, 6); // EUR 1,000 cost → CZK sell
    expect(applyRoe(24400 / 24.4, 102)).toBeCloseTo(1020, 6); // CZK 24,400 cost → EUR sell, never a discount
    expect(applyRoe(500, 100)).toBe(500);
  });
});

describe("averageByCurrency", () => {
  it("is the plain mean of fixing days in the period, rounded to 3 decimals", () => {
    const rows = [eur("2026-09-30", 99), eur("2026-10-01", 24.3), eur("2026-10-02", 24.4), eur("2026-10-05", 24.401)];
    expect(averageByCurrency(rows, "2026-10-01", "2026-10-31")).toEqual([
      { currency: "EUR", average: 24.367, amount: 1, quoted: 24.367, fixingDays: 3 },
    ]);
  });

  it("averages a quarter over all its fixings, not over monthly averages", () => {
    const rows = [eur("2026-01-05", 25), eur("2026-02-02", 24), eur("2026-02-03", 24), eur("2026-02-04", 24)];
    const q1 = periodsOfYear(2026).find((p) => p.key === "2026-Q1")!;
    expect(averageByCurrency(rows, q1.from, q1.to)[0]!.average).toBe(24.25); // monthly-mean would give 24.5
  });

  it("rounds per the quoted amount, so currencies quoted per 100 / 1000 keep their precision", () => {
    // ČNB quotes IDR per 1000 and HUF per 100 (September 2026 levels)
    const rows: Fixing[] = [
      { validDate: "2026-09-01", currency: "IDR", amount: 1000, rate: 1.188 },
      { validDate: "2026-09-02", currency: "IDR", amount: 1000, rate: 1.1918 },
      { validDate: "2026-09-01", currency: "HUF", amount: 100, rate: 6.6512 },
      { validDate: "2026-09-02", currency: "HUF", amount: 100, rate: 6.667 },
    ];
    const [huf, idr] = averageByCurrency(rows, "2026-09-01", "2026-09-30");
    expect(idr).toMatchObject({ currency: "IDR", amount: 1000, quoted: 1.19 });
    expect(idr!.average).toBeCloseTo(0.00119, 9); // per-unit rounding to 3 dp would give 0.001 (−16 %)
    expect(huf).toMatchObject({ currency: "HUF", amount: 100, quoted: 6.659 });
    expect(huf!.average).toBeCloseTo(0.06659, 9);
  });
});

describe("periodsOfYear", () => {
  it("gives 12 months, 4 quarters and the year with correct ends", () => {
    const p = periodsOfYear(2024);
    expect(p).toHaveLength(17);
    expect(p.find((x) => x.key === "2024-02")!.to).toBe("2024-02-29");
    expect(p.find((x) => x.key === "2024-Q4")).toMatchObject({ from: "2024-10-01", to: "2024-12-31" });
  });
});

describe("Prague dates", () => {
  it("uses the Prague day, not the UTC day, just after midnight", () => {
    // 2026-10-12 22:30 UTC = 2026-10-13 00:30 in Prague (summer time)
    expect(pragueToday(new Date("2026-10-12T22:30:00Z"))).toBe("2026-10-13");
  });

  it("expects today's fixing only from the 15:00 pull on a fixing day", () => {
    expect(expectedLatestFixing(new Date("2026-10-14T12:59:00Z"))).toBe("2026-10-13"); // 14:59 Prague
    expect(expectedLatestFixing(new Date("2026-10-14T13:00:00Z"))).toBe("2026-10-14"); // 15:00 Prague
    expect(expectedLatestFixing(new Date("2026-10-18T13:00:00Z"))).toBe("2026-10-16"); // Sunday → Friday
    expect(expectedLatestFixing(new Date("2026-10-28T14:00:00Z"))).toBe("2026-10-27"); // holiday → day before
    expect(previousWeekday("2026-10-12")).toBe("2026-10-09");
  });

  it("knows the Czech public holidays, including Easter", () => {
    for (const d of ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-08", "2026-10-28", "2026-12-24", "2025-04-18", "2025-04-21", "2024-03-29", "2024-04-01"]) {
      expect(isCzechHoliday(d)).toBe(true);
    }
    expect(isCzechHoliday("2026-04-02")).toBe(false);
    expect(isFixingDay("2026-10-14")).toBe(true);
    expect(isFixingDay("2026-10-17")).toBe(false);
    expect(previousFixingDay("2026-10-29")).toBe("2026-10-27");
  });
});

describe("parseRates", () => {
  it("reads the ČNB JSON and skips malformed rows", () => {
    const rows = parseRates({
      rates: [
        { validFor: "2026-10-09", order: 195, currencyCode: "EUR", amount: 1, rate: 24.365 },
        { validFor: "2026-10-09", currencyCode: "HUF", amount: 100, rate: 6.27 },
        { validFor: "bad", currencyCode: "USD", amount: 1, rate: 20.9 },
        { validFor: "2026-10-09", currencyCode: "USD", amount: 1, rate: 0 },
      ],
    });
    expect(rows).toEqual([
      { validDate: "2026-10-09", currency: "EUR", amount: 1, rate: 24.365, fixingNo: 195 },
      { validDate: "2026-10-09", currency: "HUF", amount: 100, rate: 6.27, fixingNo: null },
    ]);
  });

  it("rejects a response without a rates list", () => {
    expect(() => parseRates({ errorCode: "VALIDATION_ERROR" })).toThrow();
  });
});

describe("publicImportError", () => {
  it("shows the client's own messages and hides anything else", () => {
    expect(publicImportError(new Error("ČNB answered 503 for /exrates/daily"))).toBe("ČNB answered 503 for /exrates/daily");
    expect(publicImportError(new Error("Unexpected ČNB response: no rates list"))).toBe("Unexpected ČNB response: no rates list");
    expect(publicImportError(new TypeError("fetch failed: getaddrinfo ENOTFOUND api.cnb.cz"))).toBe("Could not reach ČNB");
    expect(publicImportError("boom")).toBe("Could not reach ČNB");
  });
});
