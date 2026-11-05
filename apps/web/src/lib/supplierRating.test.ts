import { describe, expect, it } from "vitest";
import { lowRatingNote, ratingRank, sortBestFirst } from "./supplierRating";

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

describe("best first (D14)", () => {
  it("ranks 5 down to 1 star, then not rated, then 0", () => {
    expect([0, null, 1, 5, 3].sort((a, b) => ratingRank(b) - ratingRank(a))).toEqual([5, 3, 1, null, 0]);
  });

  it("orders equal ratings by name, in Czech order", () => {
    const suppliers = [
      { name: "Zero", rating: 0 },
      { name: "Čechy", rating: null },
      { name: "Brno", rating: null },
      { name: "Dvě", rating: 2 },
      { name: "Five", rating: 5 },
    ];
    expect(sortBestFirst(suppliers, (s) => s.rating, (s) => s.name).map((s) => s.name)).toEqual(["Five", "Dvě", "Brno", "Čechy", "Zero"]);
  });
});
