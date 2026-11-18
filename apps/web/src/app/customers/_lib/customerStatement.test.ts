import { describe, expect, it } from "vitest";
import { EMAIL_OFF, statementCurrencies, statementFileName, statementSendNotice } from "./customerStatement";

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

describe("after Send by e-mail", () => {
  it("says sent only when the server sent it", () => {
    expect(statementSendNotice({ status: "sent", message: "Sent to ap@alfa.cz" }, "EUR")).toEqual({ tone: "success", text: "Sent to ap@alfa.cz" });
    expect(statementSendNotice({ status: "sent", message: "" }, "EUR").text).toBe("The EUR statement was sent");
  });

  it("says e-mail is switched off, never that it was sent", () => {
    const n = statementSendNotice({ status: "off", message: "Statement sent" }, "EUR");
    expect(n.tone).toBe("warning");
    expect(n.text.startsWith(EMAIL_OFF)).toBe(true);
    expect(n.text).toContain("was not sent");
  });

  it("says why it failed", () => {
    expect(statementSendNotice({ status: "failed", message: "No reminder contact" }, "CZK")).toEqual({
      tone: "error",
      text: "The CZK statement could not be sent: No reminder contact",
    });
  });

  it("names the file as the server does, else plainly", () => {
    expect(statementFileName("Alfa-EUR-2026-11-18.pdf", "EUR", "pdf")).toBe("Alfa-EUR-2026-11-18.pdf");
    expect(statementFileName(" ", "EUR", "csv")).toBe("statement-EUR.csv");
  });
});
