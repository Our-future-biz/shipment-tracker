import { describe, expect, it } from "vitest";
import { counterpartIndex, pairedCopies } from "./costPairs";
import type { CostLine } from "./types";

const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Air freight", chargeCode: "air_freight", description: "Air freight", currency: "EUR", amount: 100, ...over });

describe("counterpartIndex", () => {
  it("finds the line sharing the pairId first", () => {
    const others = [line({ amount: 1 }), line({ pairId: "p1", amount: 2 })];
    expect(counterpartIndex(line({ pairId: "p1" }), others)).toBe(1);
  });

  it("without a pair, takes the same item with the same description, else the same item", () => {
    const others = [line({ description: "" }), line({ description: "Air freight" })];
    expect(counterpartIndex(line(), others)).toBe(1);
    expect(counterpartIndex(line({ description: "AMS fee" }), others)).toBe(0);
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

describe("pairedCopies", () => {
  it("gives each buying line a pairId its selling copy shares, without the supplier", () => {
    const { buying, selling } = pairedCopies([line({ supplier: "COSCO" }), line({ pairId: "keep" })]);
    expect(buying[0]!.pairId).toBeTruthy();
    expect(selling[0]).toMatchObject({ pairId: buying[0]!.pairId, supplier: undefined });
    expect(buying[1]!.pairId).toBe("keep");
    expect(selling[1]!.pairId).toBe("keep");
  });
});
