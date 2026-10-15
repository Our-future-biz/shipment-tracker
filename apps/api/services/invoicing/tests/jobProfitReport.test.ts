import { describe, expect, it } from "vitest";
import { buildJobProfit, jobPeriod, type MonthAverages, type ReportShipment } from "../lib/jobProfitReport";

const ship = (over: Partial<ReportShipment>): ReportShipment => ({
  id: "s1", jobNumber: "J1", customer: "C", freightMode: "Sea", status: "active", tradeDirection: "Import",
  estimatedArrival: null, estimatedDeparture: null, actualArrival: null, actualDeparture: null, ...over,
});
const AVG: MonthAverages = new Map([
  ["2026-09", { EUR: 24.3, USD: 21.0 }],
  ["2026-10", { EUR: 24.4, USD: 21.8 }],
]);

describe("jobPeriod", () => {
  it("uses ATA for imports and ATD for exports, else ETA / ETD provisionally", () => {
    expect(jobPeriod(ship({ actualArrival: "2026-10-12", estimatedArrival: "2026-09-30" }))).toEqual({ basis: "ata", date: "2026-10-12", provisional: false });
    expect(jobPeriod(ship({ tradeDirection: "Export", actualDeparture: "2026-09-29", actualArrival: "2026-10-20" }))).toEqual({ basis: "atd", date: "2026-09-29", provisional: false });
    expect(jobPeriod(ship({ estimatedArrival: "2026-10-20" }))).toEqual({ basis: "eta", date: "2026-10-20", provisional: true });
    expect(jobPeriod(ship({}))).toBeNull();
  });
});

describe("buildJobProfit", () => {
  it("converts at the job month's average, real cost before estimate, invoiced selling only", () => {
    const { rows } = buildJobProfit(
      [ship({ actualArrival: "2026-10-12" })],
      [
        { shipmentId: "s1", estQty: null, estAmount: "900", estCurrency: "USD", realQty: null, realAmount: "1000", realCurrency: "USD" }, // real wins
        { shipmentId: "s1", estQty: "2", estAmount: "50", estCurrency: "EUR", realQty: null, realAmount: null, realCurrency: "CZK" }, // est 2 × 50
      ],
      [
        { shipmentId: "s1", qty: null, amount: "1200", currency: "USD", invoice: true },
        { shipmentId: "s1", qty: null, amount: "3000", currency: "CZK", invoice: true },
        { shipmentId: "s1", qty: null, amount: "999", currency: "EUR", invoice: false }, // not invoiced
      ],
      AVG,
      "2026-01",
      "2026-12",
    );
    expect(rows[0]).toMatchObject({ month: "2026-10", provisional: false, costCzk: 21800 + 2440, revenueCzk: 26160 + 3000, profitCzk: 29160 - 24240 });
  });

  it("uses each month's own average and filters by period", () => {
    const { rows } = buildJobProfit(
      [ship({ id: "a", jobNumber: "A", actualArrival: "2026-09-15" }), ship({ id: "b", jobNumber: "B", actualArrival: "2026-10-15" }), ship({ id: "c", jobNumber: "C", actualArrival: "2026-08-15" })],
      [],
      [
        { shipmentId: "a", qty: null, amount: "100", currency: "EUR", invoice: true },
        { shipmentId: "b", qty: null, amount: "100", currency: "EUR", invoice: true },
      ],
      AVG,
      "2026-09",
      "2026-10",
    );
    expect(rows.map((r) => [r.jobNumber, r.revenueCzk])).toEqual([["B", 2440], ["A", 2430]]);
  });

  it("leaves out and reports a currency with no average, never counting it at 1", () => {
    const { rows } = buildJobProfit([ship({ actualArrival: "2026-10-01" })], [], [{ shipmentId: "s1", qty: null, amount: "100", currency: "XYZ", invoice: true }], AVG, "2026-10", "2026-10");
    expect(rows[0]).toMatchObject({ revenueCzk: 0, unconverted: ["XYZ"] });
  });

  it("counts jobs without any date separately", () => {
    expect(buildJobProfit([ship({})], [], [], AVG, "2026-01", "2026-12")).toEqual({ rows: [], undated: 1 });
  });
});

describe("buildJobProfit quantities", () => {
  it("keeps a typed 0 and counts a real cost of 0 once it is filled in", () => {
    const { rows } = buildJobProfit(
      [ship({ actualArrival: "2026-10-12" })],
      [{ shipmentId: "s1", estQty: null, estAmount: "500", estCurrency: "CZK", realQty: null, realAmount: "0", realCurrency: "CZK" }],
      [
        { shipmentId: "s1", qty: "0", amount: "1000", currency: "CZK", invoice: true },
        { shipmentId: "s1", qty: null, amount: "300", currency: "CZK", invoice: true },
      ],
      AVG,
      "2026-10",
      "2026-10",
    );
    expect(rows[0]).toMatchObject({ revenueCzk: 300, costCzk: 0, profitCzk: 300 });
  });
});
