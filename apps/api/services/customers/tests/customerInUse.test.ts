import { describe, expect, it } from "vitest";
import { customerDeleteRefusal } from "../lib/customerInUse";

describe("a customer still in use", () => {
  it("can be deleted when no shipment and no open quote names it", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 0, openQuotes: 0, unpaidInvoices: 0 })).toBeNull();
  });

  it("is kept while shipments name it, saying how many and what to do", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 1, openQuotes: 0, unpaidInvoices: 0 })).toBe(
      "Alfa s.r.o. can't be deleted while it has 1 shipment: set it Inactive instead, or first give the shipment another customer",
    );
  });

  it("is kept while open quotes name it", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 0, openQuotes: 2, unpaidInvoices: 0 })).toBe(
      "Alfa s.r.o. can't be deleted while it has 2 open quotes: set it Inactive instead, or first mark the quotes Lost",
    );
  });

  it("is kept while it still owes invoices (Finance → Accounts Receivable)", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 0, openQuotes: 0, unpaidInvoices: 1 })).toBe(
      "Alfa s.r.o. can't be deleted while it still owes 1 invoice: set it Inactive instead",
    );
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 2, openQuotes: 0, unpaidInvoices: 3 })).toBe(
      "Alfa s.r.o. can't be deleted while it has 2 shipments and still owes 3 invoices: set it Inactive instead, or first give the shipments another customer",
    );
  });

  it("names both when both hold it", () => {
    expect(customerDeleteRefusal("Alfa s.r.o.", { shipments: 4, openQuotes: 1, unpaidInvoices: 0 })).toBe(
      "Alfa s.r.o. can't be deleted while it has 4 shipments and 1 open quote: set it Inactive instead, or first give the shipments another customer and mark the quote Lost",
    );
  });
});
