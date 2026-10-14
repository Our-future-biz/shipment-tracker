import { describe, expect, it } from "vitest";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import { convert, pickRates } from "@/lib/fx";
import { summarizeInvoices } from "./customerInvoices";

const NOW = new Date("2026-10-13T12:00:00").getTime();
const rates = { CZK: 1, EUR: 25, USD: 22 };

const inv = (over: Partial<InvoiceItem>): InvoiceItem => ({
  id: "i",
  customerId: "c",
  invoiceNumber: "X",
  amount: 0,
  currency: "EUR",
  dueDate: "2026-10-30",
  status: "Open",
  issuedAt: "2026-10-01",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...over,
});

describe("summarizeInvoices", () => {
  it("converts invoices in other currencies into the customer's currency", () => {
    const s = summarizeInvoices(
      [inv({ id: "a", amount: 1000, currency: "EUR" }), inv({ id: "b", amount: 2500, currency: "CZK" })],
      { currency: "EUR", rates },
      NOW,
    );
    expect(s.outstanding).toBe(1100);
    expect(s.openAmount).toBe(1100);
    expect(s.byCurrency).toEqual([
      { currency: "EUR", amount: 1000, count: 1 },
      { currency: "CZK", amount: 2500, count: 1 },
    ]);
    expect(s.unconverted).toEqual([]);
  });

  it("puts converted overdue amounts into the aging buckets", () => {
    const s = summarizeInvoices(
      [inv({ id: "a", amount: 25000, currency: "CZK", dueDate: "2026-09-01" })],
      { currency: "EUR", rates },
      NOW,
    );
    expect(s.overdueAmount).toBe(1000);
    expect(s.aging.find((b) => b.key === "31-60")).toMatchObject({ amount: 1000, count: 1 });
  });

  it("nets a credit note against its invoice", () => {
    const s = summarizeInvoices(
      [inv({ id: "a", amount: 29999.5, currency: "CZK" }), inv({ id: "b", amount: -29999.5, currency: "CZK" })],
      { currency: "CZK", rates },
      NOW,
    );
    expect(s.outstanding).toBe(0);
  });

  it("leaves out and reports invoices in a currency without a rate", () => {
    const s = summarizeInvoices(
      [inv({ id: "a", amount: 100, currency: "GBP" }), inv({ id: "b", amount: 50, currency: "EUR" })],
      { currency: "EUR", rates },
      NOW,
    );
    expect(s.outstanding).toBe(50);
    expect(s.unconverted).toEqual([{ currency: "GBP", amount: 100, count: 1 }]);
  });

  it("ignores paid invoices and treats a missing currency as the customer's", () => {
    const s = summarizeInvoices(
      [inv({ id: "a", amount: 500, status: "Paid" }), inv({ id: "b", amount: 70, currency: "" })],
      { currency: "USD", rates },
      NOW,
    );
    expect(s.outstanding).toBe(70);
    expect(s.byCurrency).toEqual([{ currency: "USD", amount: 70, count: 1 }]);
  });
});

describe("fx", () => {
  it("converts through CZK and refuses unknown currencies", () => {
    expect(convert(1000, "EUR", "CZK", rates)).toBe(25000);
    expect(convert(2200, "CZK", "USD", rates)).toBe(100);
    expect(convert(10, "EUR", "USD", rates)).toBeCloseTo(11.3636, 4);
    expect(convert(1, "GBP", "CZK", rates)).toBeNull();
  });

  it("picks the week of today, else the closest older, else the newest", () => {
    const rows = [
      { week: "2026-W42", validFrom: "2026-10-12", validTo: "2026-10-18", rateEur: "25.0000", rateUsd: null },
      { week: "2026-W40", validFrom: "2026-09-28", validTo: "2026-10-04", rateEur: "24.5000", rateUsd: "22.0000" },
    ];
    expect(pickRates(rows, "2026-10-13")).toEqual({ rates: { CZK: 1, EUR: 25 }, week: "2026-W42" });
    expect(pickRates(rows, "2026-10-08").week).toBe("2026-W40");
    expect(pickRates(rows, "2026-01-01").week).toBe("2026-W42");
    expect(pickRates([], "2026-10-13")).toEqual({ rates: { CZK: 1 }, week: "" });
  });
});
