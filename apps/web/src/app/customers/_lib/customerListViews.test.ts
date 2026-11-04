import { describe, expect, it } from "vitest";
import { listViewFrom, ownerFilterFrom, ratingFilterFrom, ratingRank, statusRank, supplierTypesFrom } from "./customerListViews";

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

describe("the view's own filters", () => {
  // They are the server's (GET /customers ?owner= ?types= ?rating=); the address gives only known values.
  it("are read from the address, known values only", () => {
    expect(ratingFilterFrom("low")).toBe("low");
    expect(ratingFilterFrom("2")).toBe("");
    expect(ownerFilterFrom("mine")).toBe("mine");
    expect(ownerFilterFrom("someone")).toBe("");
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
