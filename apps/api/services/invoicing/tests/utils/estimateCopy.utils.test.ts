import { describe, expect, it } from "vitest";
import { estimateCopies } from "../../utils/estimateCopy.utils";

// A source row as the list reads it; only what the copy looks at.
const row = (over: Partial<Parameters<typeof estimateCopies>[0][number]> = {}) => ({
  category: "thc_destination",
  description: "",
  vendor: "",
  supplierCustomerId: null,
  estQty: "1.00",
  estAmount: "100.00",
  estCurrency: "CZK",
  unit: "",
  sourceTruckingRef: null,
  sourceMasterJobRef: null,
  ...over,
});

describe("estimateCopies", () => {
  it("copies each estimate as a row of its own: two rows of one charge stay two", () => {
    const copies = estimateCopies([
      row({ description: "THC 1st container", estAmount: "3500.00" }),
      row({ description: "THC 2nd container", estAmount: "3500.00" }),
    ]);
    expect(copies.map((c) => [c.category, c.description, c.estAmount])).toEqual([
      ["thc_destination", "THC 1st container", "3500.00"],
      ["thc_destination", "THC 2nd container", "3500.00"],
    ]);
  });

  it("keeps the quantity, the unit price and its currency: 2 × 1,200 USD stays 2 × 1,200 USD", () => {
    const [copy] = estimateCopies([row({ category: "ocean_freight", estQty: "2.00", estAmount: "1200.00", estCurrency: "USD", unit: "container" })]);
    expect(copy).toMatchObject({ estQty: "2.00", estAmount: "1200.00", estCurrency: "USD", unit: "container" });
  });

  it("waits for the invoice in the estimate's quantity and currency, and copies no real cost", () => {
    const [copy] = estimateCopies([row({ estQty: "3.00", estCurrency: "EUR" })]);
    expect(copy).toMatchObject({ realQty: "3.00", realCurrency: "EUR" });
    expect(copy).not.toHaveProperty("realAmount");
    expect(copy).not.toHaveProperty("invoiceNumber");
  });

  it("copies a row with no category too", () => {
    expect(estimateCopies([row({ category: "", description: "Extra handling" })])).toHaveLength(1);
  });

  it("keeps the vendor and the supplier it names", () => {
    const [copy] = estimateCopies([row({ vendor: "Maersk", supplierCustomerId: "8d6f3e02-58a4-4a37-9f0e-9a1c2b3d4e5f" })]);
    expect(copy).toMatchObject({ vendor: "Maersk", supplierCustomerId: "8d6f3e02-58a4-4a37-9f0e-9a1c2b3d4e5f" });
  });

  it("leaves out Trucking's rows, a master job's shares and rows without an estimate, and numbers the rest in order", () => {
    const copies = estimateCopies([
      row({ description: "a" }),
      row({ description: "trip", sourceTruckingRef: "trucking:trip:1" }),
      row({ description: "share", sourceMasterJobRef: "master:1:0" }),
      row({ description: "real only", estAmount: null }),
      row({ description: "b" }),
    ]);
    expect(copies.map((c) => [c.description, c.sortOrder])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });
});
