import { describe, expect, it } from "vitest";
import { listViewFrom, matchesOwnerFilter, matchesRatingFilter, matchesSupplierTypes, ratingRank, statusRank, supplierTypesFrom } from "./customerListViews";

const params = (query: string) => new URLSearchParams(query);

describe("the view of the list", () => {
  it("is the one the address names", () => {
    expect(listViewFrom(params("kind=suppliers"))).toBe("suppliers");
    expect(listViewFrom(params("kind=all&role=customer"))).toBe("all");
  });

  it("is Customers for an address from before the views, so old links open the same list", () => {
    expect(listViewFrom(params(""))).toBe("customers");
    expect(listViewFrom(params("tab=prospects"))).toBe("customers");
    expect(listViewFrom(params("status=Active&role=customer"))).toBe("customers");
    expect(listViewFrom(params("kind=nonsense"))).toBe("customers");
  });

  it("is Suppliers of that type for an old filter on a supplier role", () => {
    expect(listViewFrom(params("role=haulier"))).toBe("suppliers");
    expect(supplierTypesFrom(params("role=haulier"))).toEqual(["haulier"]);
    // With a view named, ?role= is the All view's own filter, not a supplier type.
    expect(supplierTypesFrom(params("kind=all&role=haulier"))).toEqual([]);
    expect(supplierTypesFrom(params("kind=suppliers&types=shipping_line,customer,haulier"))).toEqual(["haulier", "shipping_line"]);
  });
});

describe("the Suppliers view's filters", () => {
  it("keeps the supplier types picked, any of them, or every supplier when none is", () => {
    expect(matchesSupplierTypes(["haulier", "first_last_mile_haulier"], ["first_last_mile_haulier"])).toBe(true);
    expect(matchesSupplierTypes(["shipping_line"], ["haulier", "rail_operator"])).toBe(false);
    expect(matchesSupplierTypes(["co_loader"], [])).toBe(true);
  });

  it("keeps ratings by stars, and not rated apart from 0", () => {
    expect([5, 4, 3, null, 0].map((r) => matchesRatingFilter(r, "4"))).toEqual([true, true, false, false, false]);
    expect([3, 2, null].map((r) => matchesRatingFilter(r, "3"))).toEqual([true, false, false]);
    expect([3, 2, 1, 0, null].map((r) => matchesRatingFilter(r, "low"))).toEqual([false, true, true, true, false]);
    expect([0, null].map((r) => matchesRatingFilter(r, "none"))).toEqual([false, true]);
    expect(matchesRatingFilter(null, "")).toBe(true);
  });
});

describe("best first", () => {
  it("orders 5 down to 1 star, then not rated, then 0, then companies that are no supplier", () => {
    const companies = [
      { id: "zero", roles: ["haulier"], supplierRating: 0 },
      { id: "customer", roles: ["customer"], supplierRating: null },
      { id: "unrated", roles: ["shipping_line"], supplierRating: null },
      { id: "one", roles: ["rail_operator"], supplierRating: 1 },
      { id: "five", roles: ["haulier", "customer"], supplierRating: 5 },
    ] as const;
    const best = [...companies].sort((a, b) => ratingRank(b) - ratingRank(a)).map((c) => c.id);
    expect(best).toEqual(["five", "one", "unrated", "zero", "customer"]);
  });

  it("orders statuses as the business reads them, not alphabetically", () => {
    const shown = ["Inactive", "Prospect", "Not in use", "Active", "In use"];
    expect([...shown].sort((a, b) => statusRank(a) - statusRank(b))).toEqual(["Active", "In use", "Prospect", "Inactive", "Not in use"]);
  });
});

describe("the Customers view's owner filter", () => {
  it("keeps my customers, or those with nobody as Sales Owner", () => {
    const mine = { salesOwnerUserId: "me", salesOwner: "me@x.cz" };
    const nobodys = { salesOwnerUserId: null, salesOwner: "" };
    const typedName = { salesOwnerUserId: null, salesOwner: "Martin" };
    expect([mine, nobodys, typedName].map((c) => matchesOwnerFilter(c, "mine", "me"))).toEqual([true, false, false]);
    expect([mine, nobodys, typedName].map((c) => matchesOwnerFilter(c, "none", "me"))).toEqual([false, true, false]);
    expect(matchesOwnerFilter(mine, "mine", undefined)).toBe(false);
  });
});
