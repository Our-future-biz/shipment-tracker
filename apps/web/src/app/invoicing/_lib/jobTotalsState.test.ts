import { describe, expect, it } from "vitest";
import { jobTotalsState, leftOutText } from "./jobTotalsState";

const base = { costsLoaded: true, ratesLoading: false, ratesError: false, missingCurrencies: [] as string[], unconvertibleRowCount: 0 };

describe("jobTotalsState", () => {
  it("waits for the job's rows", () => {
    expect(jobTotalsState({ ...base, costsLoaded: false })).toEqual({ kind: "wait" });
  });

  it("waits for the rates rows in another currency need, instead of totals without those rows", () => {
    // Only CZK is known while the rates load: an EUR job's rows all look unconvertible.
    expect(jobTotalsState({ ...base, ratesLoading: true, missingCurrencies: ["EUR"], unconvertibleRowCount: 4 })).toEqual({ kind: "wait" });
  });

  it("says the rates could not be loaded rather than show a part of the totals", () => {
    expect(jobTotalsState({ ...base, ratesError: true, missingCurrencies: ["EUR"], unconvertibleRowCount: 4 })).toEqual({ kind: "no-rates" });
  });

  it("shows a job all in CZK whatever the rates do", () => {
    expect(jobTotalsState({ ...base, ratesLoading: true })).toEqual({ kind: "ready", leftOut: null });
    expect(jobTotalsState({ ...base, ratesError: true })).toEqual({ kind: "ready", leftOut: null });
  });

  it("marks the rows left out for a currency ČNB has no rate for", () => {
    expect(jobTotalsState({ ...base, missingCurrencies: ["GBP"], unconvertibleRowCount: 2 })).toEqual({
      kind: "ready",
      leftOut: { currencies: ["GBP"], rows: 2 },
    });
  });
});

describe("leftOutText", () => {
  it("counts the rows and names the currencies", () => {
    expect(leftOutText({ currencies: ["GBP"], rows: 1 })).toBe("1 row of the job is left out: ČNB publishes no rate for GBP.");
    expect(leftOutText({ currencies: ["GBP", "TRY"], rows: 3 })).toBe("3 rows of the job are left out: ČNB publishes no rate for GBP, TRY.");
    expect(leftOutText({ currencies: ["EUR"], rows: 0 })).toBe("ČNB publishes no rate for EUR.");
  });
});
