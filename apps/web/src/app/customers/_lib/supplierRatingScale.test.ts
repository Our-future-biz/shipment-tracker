import { describe, expect, it } from "vitest";
import { lowRatingNote } from "./supplierRatingScale";

describe("the word under a low-rated pick (K10)", () => {
  it("says what 0–2 stars mean in the scale's own words: red at 0, amber at 1–2", () => {
    expect(lowRatingNote(0)).toEqual({ tone: "red", title: "Do not use", text: "Do not use, or only under an open corrective action." });
    expect(lowRatingNote(1)).toEqual({ tone: "amber", title: "Last resort", text: "Serious failures; use only with a manager's agreement." });
    expect(lowRatingNote(2)?.title).toBe("Use with caution");
  });

  it("says nothing for a supplier rated 3 or more, or not rated", () => {
    for (const r of [3, 4, 5, null, undefined]) expect(lowRatingNote(r)).toBeNull();
  });
});
