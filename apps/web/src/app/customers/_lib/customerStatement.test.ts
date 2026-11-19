import { describe, expect, it } from "vitest";
import { statementCurrencies } from "./customerStatement";

describe("the customer's statements: one per currency it owes in", () => {
  it("lists each currency with something left to pay, once, in order", () => {
    expect(
      statementCurrencies([
        { currency: "EUR", leftToPay: 100, status: "unpaid" },
        { currency: "EUR", leftToPay: 50, status: "part_paid" },
        { currency: "CZK", leftToPay: 2000, status: "unpaid" },
      ]),
    ).toEqual(["CZK", "EUR"]);
  });

  it("leaves out what is paid, credited, cancelled or written off, and a currency that nets to 0", () => {
    expect(
      statementCurrencies([
        { currency: "EUR", leftToPay: 0, status: "paid" },
        { currency: "USD", leftToPay: 10, status: "cancelled" },
        { currency: "GBP", leftToPay: -5, status: "unpaid" },
        { currency: "GBP", leftToPay: 5, status: "unpaid" },
        { currency: "PLN", leftToPay: 0.001, status: "unpaid" },
      ]),
    ).toEqual([]);
  });
});
