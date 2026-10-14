"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { computeCosts, type BuyingRow, type Rates, type SellingRow } from "./costsCalc";

/**
 * The costs of one shipment: the rows of the Costs Breakdown tab with the exchange rates
 * that apply to them, and the totals computed from both. The Costs Breakdown tab and the
 * Quote card on the detail page share this, so they always show the same numbers.
 */

/** Without rates only CZK is known. */
const CZK_ONLY: Rates = { CZK: 1 };

export function useCostsData(shipment: ShipmentItem | undefined) {
  // Same query key as the detail page, so the data is already in memory when a tab opens.
  const { data } = useQuery({
    queryKey: ["invoicing", shipment?.id],
    queryFn: () => api.invoicing.invoicingGet(shipment!.id),
    enabled: !!shipment,
    placeholderData: (prev) => prev,
    refetchOnMount: false,
  });

  const billingCur = data?.billingSettings?.billingCurrency || "CZK";

  // ČNB rates for this job, chosen on the server: locked at ATA (import) / ATD (export),
  // provisional by ETA / ETD until then. The key carries the dates, so editing one refetches.
  const dateKey = shipment
    ? ["tradeDirection", "estimatedArrival", "estimatedDeparture", "actualArrival", "actualDeparture"].map((f) =>
        String(getFieldValue(shipment, f) ?? ""),
      )
    : [];
  const ratesQuery = useQuery({
    queryKey: ["fx", "job", shipment?.id, ...dateKey],
    queryFn: () => api.fx.fxJobRates(shipment!.id),
    enabled: !!shipment,
    placeholderData: (prev) => prev,
  });
  const fx = ratesQuery.data ?? null;

  const rates: Rates = useMemo(
    () => (fx ? { CZK: 1, ...Object.fromEntries(fx.rates.map((r) => [r.currency, r.rate])) } : CZK_ONLY),
    [fx],
  );

  const buyRows: BuyingRow[] = useMemo(
    () =>
      (data?.costs ?? []).map((c) => ({
        id: c.id,
        category: c.category ?? "",
        vendor: c.vendor ?? "",
        estQty: c.estQty ?? "",
        estAmount: c.estAmount ?? "",
        estCurrency: c.estCurrency || "CZK",
        realQty: c.realQty ?? "",
        realAmount: c.realAmount ?? "",
        realCurrency: c.realCurrency || "CZK",
        invoiceNumber: c.invoiceNumber ?? "",
        received: !!c.received,
      })),
    [data?.costs],
  );

  const sellRows: SellingRow[] = useMemo(
    () =>
      (data?.sellingCosts ?? []).map((c) => ({
        id: c.id,
        category: c.category ?? "",
        customer: c.customer ?? "",
        qty: c.qty ?? "",
        amount: c.amount ?? "",
        currency: c.currency || "CZK",
        invoice: !!c.invoice,
        sourceBuyId: c.sourceBuyId ?? null,
      })),
    [data?.sellingCosts],
  );

  const totals = useMemo(() => computeCosts(buyRows, sellRows, billingCur, rates), [buyRows, sellRows, billingCur, rates]);

  return { data, billingCur, fx, rates, ratesLoading: ratesQuery.isLoading, ratesError: ratesQuery.isError, buyRows, sellRows, totals };
}
