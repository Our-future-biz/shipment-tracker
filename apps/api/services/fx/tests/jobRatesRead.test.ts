import { describe, expect, it } from "vitest";
import { dayOf, jobDatesOf, latestFixingsOn, planJobRatesRead } from "../lib/jobRatesRead";
import type { JobDates } from "../lib/jobRates";

// A job's rates read without fixing them: the plan of lib/jobRates, where a plan to fix only shows.

const TODAY = "2026-10-14";
const job = (over: Partial<JobDates> = {}): JobDates => ({
  tradeDirection: "Import", estimatedArrival: "2026-10-20", estimatedDeparture: "2026-09-30", actualArrival: null, actualDeparture: null, ...over,
});

describe("a date as Shipments holds it", () => {
  it("is its day, null for none, and no date at all when it is not one", () => {
    expect(dayOf("2026-10-12")).toBe("2026-10-12");
    expect(dayOf("2026-10-12T00:00:00.000Z")).toBe("2026-10-12");
    expect(dayOf(null)).toBeNull();
    expect(dayOf("  ")).toBeNull();
    expect(dayOf("12.10.2026")).toBeUndefined();
    expect(dayOf("2026-02-31")).toBeUndefined();
  });

  it("makes the job's dates days, or nothing when one of them is no date", () => {
    expect(jobDatesOf(job({ actualArrival: "2026-10-12T08:00:00Z" }))).toEqual(job({ actualArrival: "2026-10-12" }));
    expect(jobDatesOf(job({ estimatedArrival: "" }))).toEqual(job({ estimatedArrival: null }));
    expect(jobDatesOf(job({ actualArrival: "soon" }))).toBeNull();
  });
});

describe("what a job is shown at, without fixing anything", () => {
  it("is the date its rates would be fixed at, where the fixing read would fix them now", () => {
    expect(planJobRatesRead(job({ actualArrival: "2026-10-12" }), TODAY, null, false)).toEqual({ show: "date", basis: "ata", date: "2026-10-12" });
    // Today's fixing is not final yet: the same date, shown all the same.
    expect(planJobRatesRead(job({ actualArrival: TODAY }), TODAY, null, false)).toEqual({ show: "date", basis: "ata", date: TODAY });
    // An export goes by its ATD, whatever its ATA.
    expect(planJobRatesRead(job({ tradeDirection: "Export", actualDeparture: "2026-10-01", actualArrival: "2026-10-12" }), TODAY, null, false)).toEqual({ show: "date", basis: "atd", date: "2026-10-01" });
    // An ATA typed ahead is not there yet: by the ETA.
    expect(planJobRatesRead(job({ actualArrival: "2026-10-16" }), TODAY, null, false)).toEqual({ show: "date", basis: "eta", date: "2026-10-20" });
  });

  it("is the stored rates while they hold: fixed at the current ATA, or held by an invoice", () => {
    expect(planJobRatesRead(job({ actualArrival: "2026-10-12" }), TODAY, { rateDate: "2026-10-12" }, false)).toEqual({ show: "lock" });
    expect(planJobRatesRead(job({ actualArrival: "2026-10-13" }), TODAY, { rateDate: "2026-10-12" }, true)).toEqual({ show: "lock" });
  });

  it("is the new date's rates when the ATA moved and no invoice holds the old ones", () => {
    expect(planJobRatesRead(job({ actualArrival: "2026-10-13" }), TODAY, { rateDate: "2026-10-12" }, false)).toEqual({ show: "date", basis: "ata", date: "2026-10-13" });
  });

  it("is by ETA / ETD, or today, before the job is there", () => {
    expect(planJobRatesRead(job(), TODAY, null, false)).toEqual({ show: "date", basis: "eta", date: "2026-10-20" });
    expect(planJobRatesRead(job({ tradeDirection: "Export" }), TODAY, null, null)).toEqual({ show: "date", basis: "etd", date: "2026-09-30" });
    expect(planJobRatesRead(job({ estimatedArrival: null }), TODAY, null, false)).toEqual({ show: "date", basis: "today", date: TODAY });
  });

  it("is nothing when stored rates may move and it is not known whether the job is invoiced", () => {
    expect(planJobRatesRead(job({ actualArrival: "2026-10-13" }), TODAY, { rateDate: "2026-10-12" }, null)).toEqual({ show: "nothing", why: "lock_may_move" });
    // Fixed at the current ATA they hold either way.
    expect(planJobRatesRead(job({ actualArrival: "2026-10-12" }), TODAY, { rateDate: "2026-10-12" }, null)).toEqual({ show: "lock" });
  });

  it("without the job's dates is the stored rates only", () => {
    expect(planJobRatesRead(null, TODAY, { rateDate: "2026-10-12" }, null)).toEqual({ show: "lock" });
    expect(planJobRatesRead(null, TODAY, null, true)).toEqual({ show: "nothing", why: "not_fixed" });
  });
});

describe("the newest fixing of each currency on or before many dates", () => {
  const rows = [
    { validDate: "2026-10-12", currency: "EUR", amount: 1, rate: "24.300" },
    { validDate: "2026-10-09", currency: "EUR", amount: 1, rate: "24.200" },
    { validDate: "2026-10-09", currency: "USD", amount: 1, rate: "20.900" },
    { validDate: "2026-10-13", currency: "USD", amount: 1, rate: "21.000" },
    { validDate: "2026-10-13", currency: "EUR", amount: 1, rate: "24.400" },
  ];
  const on = (dates: string[]) => Object.fromEntries([...latestFixingsOn(rows, dates)].map(([d, list]) => [d, list.map((r) => `${r.currency} ${r.validDate}`).sort()]));

  it("is what one read per date would answer", () => {
    expect(on(["2026-10-13", "2026-10-11", "2026-10-12", "2026-10-11"])).toEqual({
      "2026-10-11": ["EUR 2026-10-09", "USD 2026-10-09"], // a Sunday: Friday's fixings
      "2026-10-12": ["EUR 2026-10-12", "USD 2026-10-09"], // no USD fixing that day in these rows: its older one
      "2026-10-13": ["EUR 2026-10-13", "USD 2026-10-13"],
    });
  });

  it("has nothing for a date before every fixing, and the newest for a date ahead", () => {
    expect(on(["2026-10-01", "2026-12-24"])).toEqual({ "2026-10-01": [], "2026-12-24": ["EUR 2026-10-13", "USD 2026-10-13"] });
  });
});
