import { describe, expect, it } from "vitest";
import { coverageGapItem, gapPostcode, gapReason, gapsOf, NO_BUY_REASON } from "../lib/rateGaps";
import type { PricedSide, RateLevelResult } from "../interfaces/interfaces";

const priced = { total: 100, totalCzk: 100 } as PricedSide;
const result = (over: Partial<RateLevelResult>): RateLevelResult => ({
  serviceLevel: "D1",
  label: "+1 day",
  promisedDate: null,
  promisedTime: null,
  promiseNote: "",
  sell: priced,
  buy: [priced],
  excluded: [],
  internal: null,
  marginCzk: null,
  marginPercent: null,
  belowFloor: false,
  ...over,
});
const req = { scope: "LTL" as const, toPostcode: "60200", includeBuy: true };

describe("coverage gaps of a rating", () => {
  it("takes the dates out of a reason, so one gap is one row whatever the day", () => {
    expect(gapReason("Standard LTL has no version valid on 15 Oct 2026")).toBe("Standard LTL has no version valid");
    expect(gapReason("Neither Acme LTL nor the Standard LTL sell list has a version valid on 1 Jan 2027")).toBe("Neither Acme LTL nor the Standard LTL sell list has a version valid");
    expect(gapReason("No ČNB rate for EUR on 3 Feb 2026")).toBe("No ČNB rate for EUR");
  });

  it("names the postcode a missing zone is for, else the delivery postcode", () => {
    expect(gapPostcode("No zone for postcode 110 00 in Standard LTL", "60200")).toBe("11000");
    expect(gapPostcode("Standard LTL has no D2 prices", "60200")).toBe("60200");
  });

  it("records the sell, a lane no haulier prices and the internal side; never a request without weight", () => {
    const gaps = gapsOf(req, [
      result({ sell: { reason: "No zone for postcode 790 01 in Standard LTL" }, buy: [], internal: { reason: "No internal LTL tariff" } }),
      result({ serviceLevel: "D2", sell: { reason: "Nothing to charge: give the weight or size" } }),
      // A blocked haulier priced it: not a coverage gap
      result({ serviceLevel: "D3", buy: [], excluded: [{ customerId: "h", name: "H", issues: [] }] }),
    ]);
    expect(gaps).toEqual([
      { side: "SELL", scope: "LTL", serviceLevel: "D1", postcode: "79001", reason: "No zone for postcode 790 01 in Standard LTL" },
      { side: "BUY", scope: "LTL", serviceLevel: "D1", postcode: "60200", reason: NO_BUY_REASON },
      { side: "INTERNAL", scope: "LTL", serviceLevel: "D1", postcode: "60200", reason: "No internal LTL tariff" },
    ]);
  });

  it("does not record a missing buy when buy prices were not asked for, and never repeats a key", () => {
    expect(gapsOf({ ...req, includeBuy: false }, [result({ buy: [] })])).toEqual([]);
    const twice = result({ sell: { reason: "X has no version valid on 1 Jan 2027" } });
    expect(gapsOf(req, [twice, { ...twice, sell: { reason: "X has no version valid on 2 Jan 2027" } }])).toHaveLength(1);
  });

  it("lists a stored gap with its level (none = null)", () => {
    const at = new Date("2026-10-15T08:00:00Z");
    expect(coverageGapItem({ side: "SELL", scope: "FTL", serviceLevel: "", postcode: "11000", reason: "r", count: 4, lastAt: at })).toEqual({
      side: "SELL",
      scope: "FTL",
      serviceLevel: null,
      postcode: "11000",
      reason: "r",
      count: 4,
      lastAt: "2026-10-15T08:00:00.000Z",
    });
  });
});
