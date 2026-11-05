import { describe, expect, it } from "vitest";
import { bestFirst, needsConfirmation, notInUseOf, pickable, pickName } from "./haulierRating";
import type { HaulierListItem } from "@/hooks/useTrucking";

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

  it("asks to confirm only at 0", () => {
    expect([null, 2, 1, 0].map(needsConfirmation)).toEqual([false, false, false, true]);
  });
});

describe("the hauliers a picker offers (D16)", () => {
  it("leaves out those not in use, but keeps the one already picked", () => {
    const hauliers = [
      { customerId: "a", inUse: true },
      { customerId: "b", inUse: false },
      { customerId: "c", inUse: false },
    ];
    expect(pickable(hauliers).map((h) => h.customerId)).toEqual(["a"]);
    expect(pickable(hauliers, "c").map((h) => h.customerId)).toEqual(["a", "c"]);
  });

  it("marks one kept though not in use, by name and by id", () => {
    expect(pickName({ companyName: "Kovo", inUse: true })).toBe("Kovo");
    expect(pickName({ companyName: "Kovo", inUse: false })).toBe("Kovo · Not in use");
    const hauliers = [{ customerId: "a", inUse: true }, { customerId: "b", inUse: false }] as HaulierListItem[];
    expect([...notInUseOf(hauliers)]).toEqual(["b"]);
  });
});
