import { describe, expect, it } from "vitest";
import { conditionAndLocation, conditionNotGood, lastReceipt, tallyQuestions } from "./tallyCondition";

describe("tally condition (Q20)", () => {
  it("anything but Good (and blank) is worth an exception question", () => {
    expect(conditionNotGood("Good")).toBe(false);
    expect(conditionNotGood("")).toBe(false);
    expect(conditionNotGood(undefined)).toBe(false);
    expect(conditionNotGood("Damaged packaging")).toBe(true);
  });

  it("asks about a count difference on a received tick and about a condition not Good", () => {
    expect(tallyQuestions("received", 6, 6, "Good")).toEqual([]);
    expect(tallyQuestions("received", 6, 6, "Damaged packaging")).toEqual(["Damaged packaging"]);
    expect(tallyQuestions("received", 6, 5, "Wet")).toEqual(["Short 1 pc against the expected 6", "Wet"]);
    expect(tallyQuestions("received", 6, 8, "Good")).toEqual(["Over 2 pcs against the expected 6"]);
    // A short opens its Short exception itself; its condition is still asked about.
    expect(tallyQuestions("short", 6, 4, "Damaged cargo")).toEqual(["Damaged cargo"]);
    // Nothing of a house not arrived was there to be damaged.
    expect(tallyQuestions("not_arrived", 6, 0, "Damaged cargo")).toEqual([]);
  });

  it("words condition and location for the ticked line", () => {
    expect(conditionAndLocation("Damaged packaging", "A-03-2")).toBe("Damaged packaging · at A-03-2");
    expect(conditionAndLocation("", "A-03-2")).toBe("at A-03-2");
    expect(conditionAndLocation("Good", "")).toBe("Good");
    expect(conditionAndLocation(undefined, undefined)).toBe("");
  });
});

describe("lastReceipt", () => {
  const ev = (kind: string, detail = "") => ({ kind, at: "2026-11-20T09:00:00Z", by: "Jana", detail });
  it("is the last receipt not voided since", () => {
    expect(lastReceipt([])).toBeNull();
    expect(lastReceipt([ev("positionReceived", "6 of 6 pcs counted"), ev("gateIn")])?.detail).toBe("6 of 6 pcs counted");
    expect(lastReceipt([ev("positionReceived"), ev("positionReceiptVoided")])).toBeNull();
  });
});
