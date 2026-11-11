import type { interfaces } from "@/lib/api/client";

/** The customer an invoice is billed to and the currencies it may be billed in: its default, then up to two others. */
export interface BillToCurrencies {
  companyName: string;
  currency: string;
  secondaryCurrencies: string[];
}

/**
 * The bill-to customer's currencies, as the server's preview carries them from the Customer Database
 * (any customer, however old: no list of companies is searched for it here). Only a preview of that
 * customer counts: while the preview of a customer just picked loads, the one on screen is still the
 * previous customer's. null without a customer, or when its currencies are not known.
 */
export function billToCurrencies(
  preview: Pick<interfaces.InvoicePreviewItem, "customerId" | "customer" | "customerCurrencies"> | undefined,
  billToId: string | undefined,
): BillToCurrencies | null {
  if (!preview || !billToId || preview.customerId !== billToId || !preview.customer || !preview.customerCurrencies) return null;
  return { companyName: preview.customer.companyName, ...preview.customerCurrencies };
}

/**
 * The billing currencies offered: the customer's (its default marked), or `fallback` without one. A
 * currency saved before (or since dropped from the customer) still shows as the current one.
 */
export function billingCurrencyOptions(billTo: BillToCurrencies | null, current: string, fallback: readonly string[]) {
  const allowed = billTo ? [billTo.currency, ...billTo.secondaryCurrencies] : [...fallback];
  return (allowed.includes(current) ? allowed : [current, ...allowed]).map((c) => ({
    value: c,
    label: billTo && c === billTo.currency ? `${c} · default` : c,
  }));
}
