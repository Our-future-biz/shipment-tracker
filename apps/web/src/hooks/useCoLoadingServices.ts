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
