"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { weekKeyFromDate } from "@/lib/isoWeek";
import { computeCosts, type BuyingRow, type Rates, type SellingRow } from "./costsCalc";

/**
 * The costs of one shipment: the rows of the Costs Breakdown tab with the exchange rates
 * that apply to them, and the totals computed from both. The Costs Breakdown tab and the
 * Quote card on the detail page share this, so they always show the same numbers.
 */

/** Without a rate sheet only CZK is known. */
const CZK_ONLY: Rates = { CZK: 1 };

/** Shipment date the rates follow: import by ETA, export by ETD. */
function rateDateOf(shipment: ShipmentItem, basis: "eta" | "etd") {
  const raw = getFieldValue(shipment, basis === "etd" ? "estimatedDeparture" : "estimatedArrival");
  const txt = String(raw ?? "").trim();
  if (!txt) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(txt)) return txt.slice(0, 10);
  // the grid stores dates as MM/DD/YY or MM/DD/YYYY
  const m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const year = yy!.length === 2 ? `20${yy}` : yy!;
    return `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }
  const parsed = new Date(txt);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

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

  const tradeDirection = (shipment ? getFieldValue(shipment, "tradeDirection") : "").trim().toLowerCase();
  const rateBasis: "eta" | "etd" = tradeDirection === "export" ? "etd" : "eta";
  const rateDate = useMemo(() => (shipment ? rateDateOf(shipment, rateBasis) : ""), [shipment, rateBasis]);
  const weekKey = useMemo(() => (rateDate ? weekKeyFromDate(rateDate) : ""), [rateDate]);

  // Rates come from the sheet entered on the Exchange page.
  const ratesQuery = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () => api.invoicing.exchangeRateList(),
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
    refetchOnMount: false,
  });

  /** Rates of the ETA/ETD week; the closest older week when that one is missing. */
  const fx = useMemo(() => {
    const list = ratesQuery.data?.rates ?? [];
    if (!list.length) return { rates: CZK_ONLY, source: "none" as const, usedWeek: "" };

    const exact = list.find((r) => r.week === weekKey);
    // the list comes newest first, so the first older week is the closest one
    const fallbackRow = exact ?? (rateDate ? list.find((r) => r.validFrom <= rateDate) : list[0]) ?? list[0];
    if (!fallbackRow) return { rates: CZK_ONLY, source: "none" as const, usedWeek: "" };

    const eur = Number(fallbackRow.rateEur);
    const usd = Number(fallbackRow.rateUsd);
    return {
      rates: {
        CZK: 1,
        ...(Number.isFinite(eur) && eur > 0 ? { EUR: eur } : {}),
        ...(Number.isFinite(usd) && usd > 0 ? { USD: usd } : {}),
      } as Rates,
      source: exact ? ("exact" as const) : ("older" as const),
      usedWeek: fallbackRow.week,
    };
  }, [ratesQuery.data?.rates, weekKey, rateDate]);

  const rates: Rates = fx.rates;

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

  return { data, billingCur, rateBasis, rateDate, weekKey, fx, rates, ratesLoading: ratesQuery.isLoading, buyRows, sellRows, totals };
}
