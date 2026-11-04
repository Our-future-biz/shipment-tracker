import { describe, expect, it } from "vitest";
import { bestFirst, lowRated, needsConfirmation } from "./haulierRating";

describe("hauliers best first", () => {
  it("orders 5 down to 1 star, then not rated, then 0, and equal ones by name", () => {
    const hauliers = [
      { companyName: "Zero", rating: 0 },
      { companyName: "Bravo", rating: null },
      { companyName: "Alfa", rating: null },
      { companyName: "One", rating: 1 },
      { companyName: "Five", rating: 5 },
    ];
    expect(bestFirst(hauliers).map((h) => h.companyName)).toEqual(["Five", "One", "Alfa", "Bravo", "Zero"]);
  });

  it("says a word at 2 stars or fewer, and asks to confirm only at 0", () => {
    expect([null, 5, 3, 2, 1, 0].map(lowRated)).toEqual([false, false, false, true, true, true]);
    expect([null, 2, 1, 0].map(needsConfirmation)).toEqual([false, false, false, true]);
  });
});
