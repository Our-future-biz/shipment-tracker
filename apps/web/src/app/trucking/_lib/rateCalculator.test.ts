import { describe, expect, it } from "vitest";
import { bestBuy, emptyRateForm, promisedLabel, rateFormProblems, toRateRequest } from "./rateCalculator";

describe("rate calculator form", () => {
  const ready = { ...emptyRateForm("2026-10-15"), fromPsc: "11000", toPsc: "60200", weightKg: 800 };

  it("asks for postcodes and a quantity before pricing", () => {
    expect(rateFormProblems(emptyRateForm("2026-10-15"))).toEqual([
      "From postcode has 5 digits",
      "To postcode has 5 digits",
      "Enter the weight, pallet places, LDM or volume",
    ]);
    expect(rateFormProblems(ready)).toEqual([]);
  });

  it("needs no quantity for a trip price", () => {
    expect(rateFormProblems({ ...ready, scope: "FTL", weightKg: 0 })).toEqual([]);
  });

  it("refuses negative quantities and a bad time", () => {
    expect(rateFormProblems({ ...ready, ldm: -1, pickupTime: "25:00" })).toEqual(["Pick-up time must be HH:MM", "Quantities cannot be negative"]);
  });

  it("sends every active service level", () => {
    const req = toRateRequest(ready);
    expect(req).toMatchObject({ fromPostcode: "11000", toPostcode: "60200", serviceLevels: null, includeBuy: true, includeInternal: false });
  });
});

describe("promised date", () => {
  it("reads the weekday, date and time", () => {
    expect(promisedLabel({ promisedDate: "2026-10-20", promisedTime: "by 10:00" })).toBe("Tue 20.10.2026, by 10:00");
    expect(promisedLabel({ promisedDate: "2026-10-19", promisedTime: null })).toBe("Mon 19.10.2026");
    expect(promisedLabel({ promisedDate: null, promisedTime: null })).toBe("Date agreed per order");
  });

  it("takes the first buy candidate as the best", () => {
    expect(bestBuy({ buy: [] })).toBeNull();
  });
});
