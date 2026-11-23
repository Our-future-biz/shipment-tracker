"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { isUuid } from "@/lib/uuid";

export type CoLoadingService = interfaces.CoLoadingServiceItem;
export type CoLoadingServiceNew = controllers.CoLoadingServiceCreateRequest;

const LIST_KEY = ["co-loading-services"] as const;

/** The company's Co-Loading Concept services, the oldest first: the module's tiles (closed ones a manager's only). */
export function useCoLoadingServices() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: LIST_KEY, queryFn: () => api.shipments.coLoadingServiceList() });
  const create = useMutation({
    mutationFn: (input: CoLoadingServiceNew) => api.shipments.coLoadingServiceCreate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
  return { services: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isError, create };
}

/** A manager closes a service (its tile hidden from users, nothing new put in it) or reopens it. */
export function useCoLoadingServiceClosing() {
  const qc = useQueryClient();
  const settle = () => qc.invalidateQueries({ queryKey: LIST_KEY });
  const close = useMutation({ mutationFn: (id: string) => api.shipments.coLoadingServiceClose(id), onSuccess: settle });
  const reopen = useMutation({ mutationFn: (id: string) => api.shipments.coLoadingServiceReopen(id), onSuccess: settle });
  return { close, reopen };
}

/** One service, for its own page. */
export function useCoLoadingService(id: string) {
  const isId = isUuid(id);
  const query = useQuery({
    queryKey: [...LIST_KEY, "one", id],
    queryFn: () => api.shipments.coLoadingServiceGet(id),
    enabled: isId,
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });
  return { service: query.data ?? null, isLoading: isId && query.isLoading, notFound: !isId || isNotFound(query.error) };
}

export type CoLoadingSailing = interfaces.CoLoadingSailingItem;
export type CoLoadingSailingNew = controllers.CoLoadingSailingCreateRequest;

/** A Co-Loading Concept service's sailings, the newest first, and "Create new sailing". */
export function useCoLoadingSailings(serviceId: string) {
  const qc = useQueryClient();
  const key = [...LIST_KEY, "sailings", serviceId];
  const query = useQuery({ queryKey: key, queryFn: () => api.shipments.coLoadingSailingList(serviceId), enabled: isUuid(serviceId) });
  const create = useMutation({
    mutationFn: (input: CoLoadingSailingNew) => api.shipments.coLoadingSailingCreate(serviceId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { sailings: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isError, create };
}

/** One sailing, for its own page. */
export function useCoLoadingSailing(id: string) {
  const isId = isUuid(id);
  const query = useQuery({
    queryKey: [...LIST_KEY, "sailing", id],
    queryFn: () => api.shipments.coLoadingSailingGet(id),
    enabled: isId,
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });
  return { sailing: query.data ?? null, isLoading: isId && query.isLoading, notFound: !isId || isNotFound(query.error) };
}

/**
 * How full a sailing's box is (Box utilization). Cargo is changed on the shipments' own pages, so
 * the fill is read anew whenever its tab opens or the window comes back to the front.
 */
export function useSailingUtilization(id: string) {
  const query = useQuery({
    queryKey: [...LIST_KEY, "sailing", id, "utilization"],
    queryFn: () => api.shipments.coLoadingSailingUtilization(id),
    enabled: isUuid(id),
    staleTime: 0,
    refetchOnMount: "always",
  });
  return { box: query.data ?? null, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

/**
 * Linking shipments to a sailing (its box) and taking them off. The shipments lists are read again
 * after either: the sailing's Linked shipments and what Link shipments offers are both lists of them.
 */
export function useSailingShipmentLinks(sailingId: string) {
  const qc = useQueryClient();
  // The shipments lists, and the fill of the box the shipment joined or left.
  const settle = () => Promise.all([qc.invalidateQueries({ queryKey: ["shipments"] }), qc.invalidateQueries({ queryKey: [...LIST_KEY, "sailing", sailingId, "utilization"] })]);
  const link = useMutation({
    mutationFn: (shipmentIds: string[]) => api.shipments.coLoadingSailingLinkShipments(sailingId, { shipmentIds }),
    onSuccess: settle,
  });
  const unlink = useMutation({
    mutationFn: (shipmentId: string) => api.shipments.coLoadingSailingUnlinkShipment(sailingId, shipmentId),
    onSuccess: settle,
  });
  return { link, unlink };
}
