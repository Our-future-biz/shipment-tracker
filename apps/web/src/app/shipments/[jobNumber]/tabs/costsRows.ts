import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import type { api } from "@/lib/api";
import type { BuyingRow, Rates, SellingRow } from "./costsCalc";

// The pieces computeCosts needs, read from the API, for the Costs Breakdown tab (useCostsData). The customer's
// Shipments tab gets the same figures from the server (invoicing lib/jobCostTotals), which follows these rules.

type InvoicingData = Awaited<ReturnType<typeof api.invoicing.invoicingGet>>;
type JobRates = Awaited<ReturnType<typeof api.fx.fxJobRates>>;

/** Without rates only CZK is known. */
const CZK_ONLY: Rates = { CZK: 1 };

/** The job's dates that choose its ČNB rates; they are part of the rates' query key. */
export const jobFxDates = (shipment: ShipmentItem): string[] =>
  ["tradeDirection", "estimatedArrival", "estimatedDeparture", "actualArrival", "actualDeparture"].map((f) =>
    String(getFieldValue(shipment, f) ?? ""),
  );

export const ratesOf = (fx: JobRates | null | undefined): Rates =>
  fx ? { CZK: 1, ...Object.fromEntries(fx.rates.map((r) => [r.currency, r.rate])) } : CZK_ONLY;

export const buyRowsOf = (costs: InvoicingData["costs"] | undefined): BuyingRow[] =>
  (costs ?? []).map((c) => ({
    id: c.id,
    category: c.category ?? "",
    description: c.description ?? "",
    vendor: c.vendor ?? "",
    estQty: c.estQty ?? "",
    estAmount: c.estAmount ?? "",
    estCurrency: c.estCurrency || "CZK",
    realQty: c.realQty ?? "",
    realAmount: c.realAmount ?? "",
    realCurrency: c.realCurrency || "CZK",
    invoiceNumber: c.invoiceNumber ?? "",
    received: !!c.received,
  }));

export const sellRowsOf = (sellingCosts: InvoicingData["sellingCosts"] | undefined): SellingRow[] =>
  (sellingCosts ?? []).map((c) => ({
    id: c.id,
    category: c.category ?? "",
    description: c.description ?? "",
    customer: c.customer ?? "",
    qty: c.qty ?? "",
    amount: c.amount ?? "",
    currency: c.currency || "CZK",
    invoice: !!c.invoice,
    sourceBuyId: c.sourceBuyId ?? null,
  }));
