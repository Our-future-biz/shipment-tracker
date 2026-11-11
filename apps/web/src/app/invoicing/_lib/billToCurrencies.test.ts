import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { billingCurrencyOptions, billToCurrencies } from "./billToCurrencies";

const preview = (customerId: string | null, currencies: interfaces.InvoicePreviewItem["customerCurrencies"]) => ({
  customerId,
  customer: customerId ? ({ companyName: `Company ${customerId}` } as interfaces.InvoicePartyItem) : null,
  customerCurrencies: currencies,
});

describe("billToCurrencies", () => {
  it("takes the bill-to customer's currencies from the preview", () => {
    expect(billToCurrencies(preview("c1", { currency: "EUR", secondaryCurrencies: ["USD"] }), "c1")).toEqual({
      companyName: "Company c1",
      currency: "EUR",
      secondaryCurrencies: ["USD"],
    });
  });

  it("knows none while the preview on screen is still another customer's, and none without a customer", () => {
    expect(billToCurrencies(preview("c1", { currency: "EUR", secondaryCurrencies: [] }), "c2")).toBeNull();
    expect(billToCurrencies(preview(null, null), undefined)).toBeNull();
    expect(billToCurrencies(undefined, "c1")).toBeNull();
    // the customer could not be read
    expect(billToCurrencies(preview("c1", null), "c1")).toBeNull();
  });
});

describe("billingCurrencyOptions", () => {
  it("offers the customer's default, marked, then its others", () => {
    const billTo = { companyName: "A", currency: "EUR", secondaryCurrencies: ["CZK"] };
    expect(billingCurrencyOptions(billTo, "EUR", ["CZK", "EUR", "USD"])).toEqual([
      { value: "EUR", label: "EUR · default" },
      { value: "CZK", label: "CZK" },
    ]);
  });

  it("keeps a currency saved before in front, and offers the fallback without a customer", () => {
    const billTo = { companyName: "A", currency: "EUR", secondaryCurrencies: [] };
    expect(billingCurrencyOptions(billTo, "GBP", []).map((o) => o.value)).toEqual(["GBP", "EUR"]);
    expect(billingCurrencyOptions(null, "CZK", ["CZK", "EUR", "USD"]).map((o) => o.label)).toEqual(["CZK", "EUR", "USD"]);
  });
});
