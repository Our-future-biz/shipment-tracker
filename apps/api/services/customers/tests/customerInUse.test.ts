import { describe, expect, it } from "vitest";
import { customerDeleteRefusal } from "../lib/customerInUse";

describe("a customer still in use", () => {
  it("can be deleted when no shipment and no open quote names it", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 0, openQuotes: 0 })).toBeNull();
  });

  it("is kept while shipments name it, saying how many and what to do", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 1, openQuotes: 0 })).toBe(
      "Alfa s.r.o. can't be deleted while it has 1 shipment: set it Inactive instead, or first give the shipment another customer",
    );
  });

  it("is kept while open quotes name it", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 0, openQuotes: 2 })).toBe(
      "Alfa s.r.o. can't be deleted while it has 2 open quotes: set it Inactive instead, or first mark the quotes Lost",
    );
  });

  it("names both when both hold it", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 4, openQuotes: 1 })).toBe(
      "Alfa s.r.o. can't be deleted while it has 4 shipments and 1 open quote: set it Inactive instead, or first give the shipments another customer and mark the quote Lost",
    );
  });
});
