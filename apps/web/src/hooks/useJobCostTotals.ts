"use client";

import { useQueries } from "@tanstack/react-query";
import { computeCosts } from "@/app/shipments/[jobNumber]/tabs/costsCalc";
import { buyRowsOf, jobFxDates, ratesOf, sellRowsOf } from "@/app/shipments/[jobNumber]/tabs/costsRows";
import { FX_KEYS } from "@/hooks/useFx";
import { invoicingKey } from "@/hooks/useInvoicing";
import type { ShipmentItem } from "@/hooks/useShipments";
import { api } from "@/lib/api";

export interface JobCostTotals {
  revenue: number;
  cost: number;
  profit: number;
}

/**
 * Revenue, cost and profit of each shipment exactly as its Costs Breakdown tab works them out — the same rows
 * (from Invoicing), the same ČNB rates of the job and the same computeCosts — then shown in `currency` at the
 * job's own rate. The queries are the ones the shipment page uses, so their data is shared with it.
 *
 * A shipment maps to null while its data is loading, when it could not be loaded, or when a rate is missing
 * (a row in a currency without a rate, or no rate for `currency`): a total that leaves something out is not shown.
 */
export function useJobCostTotals(shipments: ShipmentItem[], currency: string) {
  const invoicing = useQueries({
    queries: shipments.map((shipment) => ({
      queryKey: invoicingKey(shipment.id),
      queryFn: () => api.invoicing.invoicingGet(shipment.id),
    })),
  });
  const fx = useQueries({
    queries: shipments.map((shipment) => ({
      queryKey: FX_KEYS.job(shipment.id, jobFxDates(shipment)),
      queryFn: () => api.fx.fxJobRates(shipment.id),
    })),
  });

  const totals = new Map<string, JobCostTotals | null>();
  shipments.forEach((shipment, i) => {
    const data = invoicing[i]?.data;
    const jobRates = fx[i]?.data;
    if (!data || !jobRates) {
      totals.set(shipment.id, null);
      return;
    }
    const rates = ratesOf(jobRates);
    const billingCur = data.billingSettings?.billingCurrency || "CZK";
    const result = computeCosts(buyRowsOf(data.costs), sellRowsOf(data.sellingCosts), billingCur, rates);
    const rate = currency === "CZK" ? 1 : rates[currency];
    if (result.unconvertibleRowCount > 0 || !rate) {
      totals.set(shipment.id, null);
      return;
    }
    totals.set(shipment.id, { revenue: result.sellCZK / rate, cost: result.buyCZK / rate, profit: result.profitCZK / rate });
  });

  return { totals, isLoading: invoicing.some((q) => q.isLoading) || fx.some((q) => q.isLoading) };
}
