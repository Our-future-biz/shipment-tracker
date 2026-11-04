import { describe, expect, it } from "vitest";
import { canSaveRating, reasonAfterChoice } from "./supplierRatingChoice";

describe("the reason as the rating choice moves", () => {
  it("empties the saved reason on a move to 0–2 stars from another rating, also within 0–2 (m17)", () => {
    expect(reasonAfterChoice({ rating: 4, reason: "Always on time" }, "Always on time", 1)).toBe("");
    expect(reasonAfterChoice({ rating: 2, reason: "Late twice" }, "Late twice", 0)).toBe("");
  });

  it("empties a low rating's reason on a move up to 3–5 stars", () => {
    expect(reasonAfterChoice({ rating: 1, reason: "Lost a pallet" }, "Lost a pallet", 4)).toBe("");
    expect(reasonAfterChoice({ rating: 0, reason: "Fraud" }, "Fraud", 3)).toBe("");
  });

  it("keeps the saved reason on a move within 3–5 stars", () => {
    expect(reasonAfterChoice({ rating: 4, reason: "Reliable" }, "Reliable", 5)).toBe("Reliable");
  });

  it("keeps a reason the manager typed, whatever the move", () => {
    expect(reasonAfterChoice({ rating: 1, reason: "Lost a pallet" }, "Better since May", 4)).toBe("Better since May");
    expect(reasonAfterChoice({ rating: 4, reason: "Reliable" }, "Two claims", 2)).toBe("Two claims");
  });

  it("brings the saved reason back on a return to the saved rating, unless one was typed", () => {
    expect(reasonAfterChoice({ rating: 1, reason: "Lost a pallet" }, "", 1)).toBe("Lost a pallet");
    expect(reasonAfterChoice({ rating: 1, reason: "Lost a pallet" }, "Typed", 1)).toBe("Typed");
  });

  it("has nothing to empty for a supplier not rated yet", () => {
    expect(reasonAfterChoice({ rating: null, reason: "" }, "", 2)).toBe("");
    expect(reasonAfterChoice({ rating: null, reason: "" }, "New one", 5)).toBe("New one");
  });
});

describe("whether the rating can be saved", () => {
  const saved = { rating: 2, reason: "Late twice" };

  it("needs a choice, and a reason at 0–2 stars", () => {
    expect(canSaveRating({ rating: null, reason: "" }, null, "")).toBe(false);
    expect(canSaveRating(saved, 1, "  ")).toBe(false);
    expect(canSaveRating(saved, 1, "Lost a pallet")).toBe(true);
    expect(canSaveRating(saved, 4, "")).toBe(true);
  });

  it("is refused while nothing changed, so a click adds no duplicate to the history", () => {
    expect(canSaveRating(saved, 2, "Late twice")).toBe(false);
    expect(canSaveRating(saved, 2, " Late twice ")).toBe(false);
    expect(canSaveRating(saved, 2, "Late three times")).toBe(true);
    expect(canSaveRating({ rating: 5, reason: "" }, 5, "")).toBe(false);
  });
});
