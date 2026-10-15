import { describe, expect, it } from "vitest";
import { storableLine } from "../lib/truckingLinks";

describe("a price line as Costs keeps it (2 decimals)", () => {
  it("keeps quantity × unit price when they give the amount exactly", () => {
    expect(storableLine({ qty: 1250, unit: "kg", unitPrice: 2.4, amount: 3000 })).toEqual({ qty: 1250, unit: "kg", unitPrice: 2.4 });
    expect(storableLine({ qty: 1, unit: "", unitPrice: 3990, amount: 3990 })).toEqual({ qty: 1, unit: "", unitPrice: 3990 });
    // 0.1 × 100 is 10.000000000000002 in floating point: still exact.
    expect(storableLine({ qty: 100, unit: "kg", unitPrice: 0.1, amount: 10 })).toEqual({ qty: 100, unit: "kg", unitPrice: 0.1 });
  });

  it("stores a percentage as one line of the exact amount (12.5 % of 20 800 = 2 600, not 0.13 × 20 800)", () => {
    expect(storableLine({ qty: 20800, unit: "%", unitPrice: 0.125, amount: 2600 })).toEqual({ qty: 1, unit: "", unitPrice: 2600 });
    // A discount line priced as a negative percentage.
    expect(storableLine({ qty: 4489, unit: "%", unitPrice: -0.075, amount: -336.68 })).toEqual({ qty: 1, unit: "", unitPrice: -336.68 });
  });

  it("stores a line whose rounded product would differ from its amount as one line", () => {
    expect(storableLine({ qty: 3, unit: "pallet", unitPrice: 33.33, amount: 100 })).toEqual({ qty: 1, unit: "", unitPrice: 100 });
  });
});
