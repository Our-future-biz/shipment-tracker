import { describe, expect, it } from "vitest";
import { buyingQuantity, counterpartIndex, lineRemovals, offerToSelling, pairedCopies, withBuyingTerms } from "./costPairs";
import type { CostLine } from "./types";

const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Air freight", chargeCode: "air_freight", description: "Air freight", currency: "EUR", amount: 100, ...over });

describe("counterpartIndex", () => {
  it("finds the line sharing the pairId first", () => {
    const others = [line({ amount: 1 }), line({ pairId: "p1", amount: 2 })];
    expect(counterpartIndex(line({ pairId: "p1" }), others)).toBe(1);
  });

  it("without a pair, takes the same item with the same description only - another text is not guessed", () => {
    const others = [line({ description: "" }), line({ description: "Air freight" })];
    expect(counterpartIndex(line(), others)).toBe(1);
    expect(counterpartIndex(line({ description: "AMS fee" }), others)).toBe(-1);
    // Two "Other" lines are not the same charge for sharing the catch-all code.
    const other = (description: string) => line({ type: "Other", chargeCode: "other", description });
    expect(counterpartIndex(other("Terminal handling"), [other("Insurance")])).toBe(-1);
  });

  it("finds nothing for a paired line whose partner was removed alone", () => {
    expect(counterpartIndex(line({ pairId: "gone" }), [line()])).toBe(-1);
  });

  it("does not guess a line already paired with another one, nor another item", () => {
    expect(counterpartIndex(line(), [line({ pairId: "p9" })])).toBe(-1);
    expect(counterpartIndex(line(), [line({ chargeCode: "ocean_freight", type: "Ocean freight" })])).toBe(-1);
    expect(counterpartIndex(line(), [])).toBe(-1);
  });
});

describe("offerToSelling", () => {
  it("offers a buying line that has no selling counterpart yet", () => {
    expect(offerToSelling(line(), [])).toBe(true);
    expect(offerToSelling(line({ pairId: "p1" }), [line({ pairId: "p2" })])).toBe(true);
  });

  it("does not offer one whose selling counterpart is already there", () => {
    expect(offerToSelling(line({ pairId: "p1" }), [line({ pairId: "p1", amount: 0 })])).toBe(false);
    expect(offerToSelling(line(), [line()])).toBe(false);
  });
});

describe("lineRemovals", () => {
  it("removes the line alone, or with its counterpart on the other side", () => {
    expect(lineRemovals("buying", 1, 2, false)).toEqual([{ side: "buying", index: 1 }]);
    expect(lineRemovals("buying", 1, 2, true)).toEqual([
      { side: "buying", index: 1 },
      { side: "selling", index: 2 },
    ]);
    expect(lineRemovals("selling", 0, 3, true)).toEqual([
      { side: "selling", index: 0 },
      { side: "buying", index: 3 },
    ]);
  });
});

describe("pairedCopies", () => {
  it("gives each buying line a pairId its selling copy shares, without the supplier", () => {
    const { buying, selling } = pairedCopies([line({ supplier: "COSCO" }), line({ pairId: "keep" })]);
    expect(buying[0]!.pairId).toBeTruthy();
    expect(selling[0]).toMatchObject({ pairId: buying[0]!.pairId, supplier: undefined });
    expect(buying[1]!.pairId).toBe("keep");
    expect(selling[1]!.pairId).toBe("keep");
  });
});

describe("buyingQuantity", () => {
  it("is the buying line's quantity on a line charged as a lump sum", () => {
    expect(buyingQuantity(line({ pairId: "p", value: 2 }), [line({ pairId: "p", value: 1 })])).toEqual({ value: 1 });
  });

  it("holds an empty buying quantity too", () => {
    expect(buyingQuantity(line({ pairId: "p", value: 2 }), [line({ pairId: "p" })])).toEqual({ value: undefined });
  });

  it("is nothing for a line with no buying line: it stays free", () => {
    expect(buyingQuantity(line({ pairId: "p", value: 2 }), [])).toBeNull();
    expect(buyingQuantity(line({ pairId: "p", value: 2 }), [line({ pairId: "other", value: 1 })])).toBeNull();
  });

  it("is nothing per W/M or per container: the cargo sets those", () => {
    expect(buyingQuantity(line({ pairId: "p" }), [line({ pairId: "p", basis: "wm", value: 3 })])).toBeNull();
    expect(buyingQuantity(line({ pairId: "p" }), [line({ pairId: "p", basis: "container", value: 3 })])).toBeNull();
  });
});

describe("withBuyingTerms", () => {
  it("gives a selling line its buying line's quantity, and leaves its amount alone", () => {
    const out = withBuyingTerms([line({ pairId: "p", value: 1, amount: 1259 })], [line({ pairId: "p", value: 2, amount: 1410.08 })]);
    expect(out).toEqual([expect.objectContaining({ pairId: "p", value: 1, amount: 1410.08 })]);
  });

  it("clears the quantity when the buying line has none", () => {
    expect(withBuyingTerms([line({ pairId: "p" })], [line({ pairId: "p", value: 2 })])![0]!.value).toBeUndefined();
  });

  it("gives it the buying line's basis, and doesn't copy a quantity the cargo sets", () => {
    const out = withBuyingTerms([line({ pairId: "p", basis: "wm", value: 3.638 })], [line({ pairId: "p", value: 2 })]);
    expect(out![0]).toMatchObject({ basis: "wm", value: 2 });
  });

  it("leaves a selling line with no buying line as it is", () => {
    expect(withBuyingTerms([line({ pairId: "other", value: 1 })], [line({ pairId: "p", value: 2 })])).toBeNull();
  });

  it("is null when every line has them already, a lump sum left unstated included", () => {
    expect(withBuyingTerms([line({ pairId: "p", value: 1 })], [line({ pairId: "p", value: 1, basis: "lumpsum" })])).toBeNull();
    expect(withBuyingTerms(undefined, undefined)).toBeNull();
  });
});
