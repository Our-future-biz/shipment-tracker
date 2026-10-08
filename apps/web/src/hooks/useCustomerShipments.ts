"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { NEEDS_ATTENTION_KEY } from "@/hooks/useShipmentsNeedingAttention";

export type ShipmentItem = interfaces.ShipmentItem;

// The API returns at most 200 shipments per request, newest first.
const PAGE_SIZE = 200;

// The most shipments the customer page loads. Beyond this the lists and charts cover only the
// newest ones (and say so); the header totals always come from the server-side rollup.
export const CUSTOMER_SHIPMENTS_LIMIT = 1000;

// One shared empty list, so consumers memoising on `shipments` do not recompute while loading.
const NO_SHIPMENTS: ShipmentItem[] = [];

async function fetchCustomerShipments(customerId: string) {
  const shipments: ShipmentItem[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let total = 0;
  do {
    const page = await api.shipments.shipmentList({ customerId, limit: PAGE_SIZE, offset });
    total = page.pagination.total;
    // A shipment created between two requests shifts every row down by one, so a page can start
    // with a row the previous one ended on: keep each shipment once.
    for (const shipment of page.data) {
      if (seen.has(shipment.id)) continue;
      seen.add(shipment.id);
      shipments.push(shipment);
    }
    // The offset follows what the server returned, not what was kept, so the loop always advances.
    offset += page.data.length;
    // An empty page means the total moved under us; stop rather than ask forever.
    if (page.data.length === 0) break;
  } while (offset < total && shipments.length < CUSTOMER_SHIPMENTS_LIMIT);
  return { shipments, total };
}

// The CRM "Shipments" tab reuses the shipments service, filtered by customerId.
export const useCustomerShipments = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-shipments", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchCustomerShipments(customerId),
    enabled: !!customerId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.shipments.shipmentDelete(id),
    onSuccess: () => {
      // Deleting a shipment also recomputes the customer's stored rollups server-side,
      // so the customer queries must refresh together with the shipment list.
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      // The delete is company-wide, so the Shipments module must drop the row as well.
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: NEEDS_ATTENTION_KEY });
    },
  });

  const shipments = query.data?.shipments ?? NO_SHIPMENTS;

  return {
    shipments,
    // True when the customer has more shipments than were loaded.
    isCapped: (query.data?.total ?? 0) > shipments.length,
    isLoading: query.isLoading,
    // True only when the request failed and there is nothing to show.
    isError: query.isLoadingError,
    deleteShipment: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
};
