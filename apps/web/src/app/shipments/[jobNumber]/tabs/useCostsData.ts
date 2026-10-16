"use client";

import { useMemo } from "react";
import { useInvoicing } from "@/hooks/useInvoicing";
import { useJobFxRates } from "@/hooks/useFx";
import type { ShipmentItem } from "@/hooks/useShipments";
import { computeCosts } from "./costsCalc";
import { buyRowsOf, jobFxDates, ratesOf, sellRowsOf } from "./costsRows";

/**
 * The costs of one shipment: the rows of the Costs Breakdown tab with the exchange rates
 * that apply to them, and the totals computed from both. The Costs Breakdown tab and the
 * Quote card on the detail page share this, so they always show the same numbers. The
 * customer's Shipments tab gets the same figures from the server (invoicing lib/jobCostTotals).
 */

export function useCostsData(shipment: ShipmentItem | undefined) {
  // The one shared invoicing query, so the data is already in memory when a tab opens.
  const { data } = useInvoicing(shipment?.id ?? null);

  const billingCur = data?.billingSettings?.billingCurrency || "CZK";

  // ČNB rates for this job, chosen on the server: locked at ATA (import) / ATD (export),
  // provisional by ETA / ETD until then. The key carries the dates, so editing one refetches.
  const ratesQuery = useJobFxRates(shipment?.id, shipment ? jobFxDates(shipment) : []);
  const fx = ratesQuery.data ?? null;

  const rates = useMemo(() => ratesOf(fx), [fx]);
  const buyRows = useMemo(() => buyRowsOf(data?.costs), [data?.costs]);
  const sellRows = useMemo(() => sellRowsOf(data?.sellingCosts), [data?.sellingCosts]);

  const totals = useMemo(() => computeCosts(buyRows, sellRows, billingCur, rates), [buyRows, sellRows, billingCur, rates]);

  return { data, billingCur, fx, rates, ratesLoading: ratesQuery.isLoading, ratesError: ratesQuery.isError, buyRows, sellRows, totals };
}
