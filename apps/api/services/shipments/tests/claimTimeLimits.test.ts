import { describe, expect, it } from "vitest";
import { GENERAL_PRACTICE, TIME_LIMITS_NEED_NUMBERS, TIME_LIMITS_OFF, addMonths, claimDeadlines, savedLimits } from "../lib/claimTimeLimits";

// The company's claim time limits (Council Outlay 11, D21): general practice, switched off until a
// manager confirms the numbers; the deadlines of a cargo claim from the job's delivery, else its ATA.

const ON = { enabled: true, limits: GENERAL_PRACTICE };
const sea = { tradeDirection: "Import", freightMode: "Sea Freight", department: "", actualDeliveryDate: null, actualArrival: null };

describe("the general practice", () => {
  it("is sea 3 days, road and rail 7, air 14; suit 1 year, air 2 years - and off", () => {
    expect(GENERAL_PRACTICE).toEqual({
      sea: { noticeDays: 3, suitMonths: 12 },
      air: { noticeDays: 14, suitMonths: 24 },
      rail: { noticeDays: 7, suitMonths: 12 },
      road: { noticeDays: 7, suitMonths: 12 },
    });
    expect(TIME_LIMITS_OFF.enabled).toBe(false);
  });
});

describe("a save of the limits", () => {
  const all = { sea: { noticeDays: 2, suitMonths: 12 }, air: { noticeDays: 14, suitMonths: 24 }, rail: { noticeDays: 7, suitMonths: 9 }, road: { noticeDays: 7, suitMonths: 12 } };

  it("switching them on needs all four modes' numbers", () => {
    expect(savedLimits(true, { sea: all.sea }, GENERAL_PRACTICE)).toEqual({ problem: TIME_LIMITS_NEED_NUMBERS });
    expect(savedLimits(true, all, GENERAL_PRACTICE)).toEqual({ limits: all });
  });

  it("switched off keeps what a mode not sent had", () => {
    expect(savedLimits(false, { rail: { noticeDays: 5, suitMonths: 6 } }, GENERAL_PRACTICE)).toEqual({ limits: { ...GENERAL_PRACTICE, rail: { noticeDays: 5, suitMonths: 6 } } });
  });

  it("refuses a number that is no whole one in range", () => {
    expect(savedLimits(false, { sea: { noticeDays: 0, suitMonths: 12 } }, GENERAL_PRACTICE)).toEqual({ problem: "The notice days (sea) must be a whole number from 1 to 365" });
    expect(savedLimits(false, { air: { noticeDays: 14, suitMonths: 1.5 } }, GENERAL_PRACTICE)).toEqual({ problem: "The suit months (air) must be a whole number from 1 to 120" });
    expect(savedLimits(false, { road: { noticeDays: 366, suitMonths: 12 } }, GENERAL_PRACTICE)).toMatchObject({ problem: expect.stringContaining("road") });
  });
});

describe("addMonths", () => {
  it("adds calendar months, the 31st of a shorter month being its last day", () => {
    expect(addMonths("2026-11-10", 12)).toBe("2027-11-10");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-12-31", 2)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 24)).toBe("2028-11-30");
  });
});

describe("a cargo claim's deadlines", () => {
  it("are none while the limits are off", () => {
    expect(claimDeadlines({ ...sea, actualDeliveryDate: "2026-11-10" }, TIME_LIMITS_OFF)).toEqual({ from: null, noticeBy: null, suitBy: null });
  });

  it("count from the delivery, else the ATA, with the job's mode's numbers", () => {
    expect(claimDeadlines({ ...sea, actualDeliveryDate: "2026-11-10", actualArrival: "2026-11-08" }, ON)).toEqual({ from: "delivery", noticeBy: "2026-11-13", suitBy: "2027-11-10" });
    expect(claimDeadlines({ ...sea, actualArrival: "2026-11-08" }, ON)).toEqual({ from: "arrival", noticeBy: "2026-11-11", suitBy: "2027-11-08" });
    expect(claimDeadlines({ ...sea, freightMode: "Air Freight", actualDeliveryDate: "2026-11-10" }, ON)).toEqual({ from: "delivery", noticeBy: "2026-11-24", suitBy: "2028-11-10" });
    expect(claimDeadlines({ ...sea, freightMode: "Rail Freight", actualDeliveryDate: "2026-11-10" }, ON)).toMatchObject({ noticeBy: "2026-11-17" });
    expect(claimDeadlines({ ...sea, tradeDirection: "Domestic", freightMode: "", actualDeliveryDate: "2026-11-10" }, ON)).toMatchObject({ noticeBy: "2026-11-17" });
  });

  it("are none when the job has neither a delivery nor an ATA", () => {
    expect(claimDeadlines(sea, ON)).toEqual({ from: null, noticeBy: null, suitBy: null });
  });
});
