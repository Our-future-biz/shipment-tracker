import { describe, expect, it } from "vitest";
import { exceptionViewQuery, prefillFromParams, suggestionPrefill, tallyPrefill } from "./exceptionPrefill";

describe("the phone's exception screen opens with what was found (mock council S11-1)", () => {
  it("takes the receipt's first suggestion", () => {
    expect(suggestionPrefill([{ type: "Short", pieces: 2 }, { type: "Damaged", pieces: 1 }])).toEqual({ type: "Short", pieces: 2 });
    expect(suggestionPrefill([{ type: "Damaged", pieces: 0 }])).toEqual({ type: "Damaged", pieces: 1 });
    expect(suggestionPrefill([])).toBeNull();
  });

  it("after a tally tick: the count difference, else the condition", () => {
    expect(tallyPrefill("received", 6, 4, "Good")).toEqual({ type: "Short", pieces: 2 });
    expect(tallyPrefill("received", 6, 7, "Wet")).toEqual({ type: "Over", pieces: 1 });
    expect(tallyPrefill("received", 6, 6, "Damaged packaging")).toEqual({ type: "Damaged", pieces: 1 });
    expect(tallyPrefill("short", 6, 4, "Good")).toBeNull();
    expect(tallyPrefill("not_arrived", 6, null, "Wet")).toBeNull();
  });

  it("goes through the link and back", () => {
    const q = new URLSearchParams(exceptionViewQuery({ type: "Short", pieces: 2 }));
    expect(q.get("view")).toBe("damage");
    expect(prefillFromParams(q.get("type"), q.get("pieces"))).toEqual({ type: "Short", pieces: 2 });
    expect(exceptionViewQuery(null)).toBe("view=damage");
    expect(prefillFromParams(null, null)).toBeNull();
    expect(prefillFromParams("Lost", "2")).toBeNull();
    expect(prefillFromParams("Over", "-3")).toEqual({ type: "Over", pieces: 1 });
  });
});
