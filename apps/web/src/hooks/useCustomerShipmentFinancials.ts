"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type ShipmentFinancials = interfaces.ShipmentFinancials;

/** A customer's shipment financials for a set of shipments in a currency. */
export const customerShipmentFinancialsKey = (customerId: string, shipmentIds: readonly string[], currency: string) =>
  ["customer-shipment-financials", customerId, currency, ...shipmentIds] as const;

/**
 * Revenue, cost and profit of the given shipments of a customer, worked out on the server as each
 * job's Costs Breakdown does (its Invoicing rows and the job's ČNB rates), in `currency`. One request
 * for the whole page of rows. A shipment's figures are null when a rate is missing — a total that
 * leaves something out is not shown — and `isError` tells a failed request from that.
 */
export function useCustomerShipmentFinancials(customerId: string, shipmentIds: readonly string[], currency: string) {
  const query = useQuery({
    queryKey: customerShipmentFinancialsKey(customerId, shipmentIds, currency),
    queryFn: () => api.customers.customerShipmentFinancials(customerId, { shipmentIds: [...shipmentIds], currency }),
    enabled: !!customerId && shipmentIds.length > 0,
    placeholderData: keepPreviousData,
  });
  const byShipment = new Map((query.data?.items ?? []).map((item) => [item.shipmentId, item]));
  return { byShipment, isLoading: query.isLoading, isError: query.isError };
}
