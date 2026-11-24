"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { isUuid } from "@/lib/uuid";

export type CoLoadingService = interfaces.CoLoadingServiceItem;
export type CoLoadingServiceNew = controllers.CoLoadingServiceCreateRequest;

const LIST_KEY = ["co-loading-services"] as const;

/** What every Co-Loading query's key starts with: a shipment write elsewhere marks them all stale (useShipments). */
export const CO_LOADING_KEY = LIST_KEY;

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

/** The company's Co-Loading settings (the planning share of a box's volume): read by everyone, saved by managers. */
export function useCoLoadingSettings() {
  const qc = useQueryClient();
  const key = [...LIST_KEY, "settings"];
  const query = useQuery({ queryKey: key, queryFn: () => api.shipments.coLoadingSettingsGet() });
  const save = useMutation({
    mutationFn: (planningVolumePct: number) => api.shipments.coLoadingSettingsSet({ planningVolumePct }),
    // Every box's fill is worked out with the share: all of Co-Loading is read again.
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
  return { settings: query.data ?? null, isLoading: query.isLoading, isError: query.isError, save };
}

/** A manager sets a service's lower cargo weight for its inland leg, or takes it off. */
export function useCoLoadingInlandWeight(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inlandWeightKg: number | null) => api.shipments.coLoadingServiceInlandWeight(serviceId, { inlandWeightKg }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
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
  const notFound = !isId || isNotFound(query.error);
  return {
    service: query.data ?? null,
    isLoading: isId && query.isLoading,
    notFound,
    // A read that failed for any other reason than a missing service: said with the server's words, never as "not found".
    isError: isId && query.isError && !notFound,
    error: query.error,
    refetch: query.refetch,
  };
}

export type CoLoadingSailing = interfaces.CoLoadingSailingItem;
export type CoLoadingSailingNew = controllers.CoLoadingSailingCreateRequest;

/**
 * A Co-Loading Concept service's sailings, the newest first, and "Create new sailing". Each carries
 * its box's fill, which moves with the shipments' cargo and status changed elsewhere: read anew as
 * the profits beside it are, on every showing and on coming back to the window.
 */
export function useCoLoadingSailings(serviceId: string) {
  const qc = useQueryClient();
  const key = [...LIST_KEY, "sailings", serviceId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.shipments.coLoadingSailingList(serviceId),
    enabled: isUuid(serviceId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
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
    // The app does not read again on coming back to the window; a box's fill must (Council Review 7, K15).
    refetchOnWindowFocus: true,
  });
  return { box: query.data ?? null, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

/** A sailing's earnings, read fresh each time the tab opens. Managers only: `enabled` keeps others from asking. */
export function useSailingEarnings(id: string, enabled = true) {
  const query = useQuery({
    queryKey: [...LIST_KEY, "sailing", id, "earnings"],
    queryFn: () => api.shipments.coLoadingSailingEarnings(id),
    enabled: enabled && isUuid(id),
    staleTime: 0,
    refetchOnMount: "always",
    // A selling line fixed in another tab shows as soon as the manager is back here (K15).
    refetchOnWindowFocus: true,
  });
  return { earnings: query.data ?? null, isLoading: query.isLoading, isError: query.isError, isFetching: query.isFetching, refetch: query.refetch };
}

/** The profit of each of a service's sailings, by sailing id. Managers only: `enabled` keeps others from asking. */
export function useSailingProfits(serviceId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: [...LIST_KEY, "sailings", serviceId, "profits"],
    queryFn: () => api.shipments.coLoadingSailingProfits(serviceId),
    enabled: enabled && isUuid(serviceId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { profits: new Map((query.data?.data ?? []).map((p) => [p.sailingId, p])), isLoading: query.isLoading, isError: query.isError };
}

type BoxCostInput = { kind: string; amount: number | null; currency: string; note: string };

/** Setting one container's box costs. The earnings and the record of changes are read again. */
export function useSailingBoxCosts(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (costs: { containerNo: number; lines: BoxCostInput[]; expected: BoxCostInput[] }) => api.shipments.coLoadingSailingBoxCostsSave(id, costs),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...LIST_KEY, "sailing", id] }),
  });
}

/** Every change of a sailing's box costs, the last one first; read only once asked for. */
export function useSailingBoxCostChanges(id: string, enabled: boolean) {
  const query = useQuery({
    queryKey: [...LIST_KEY, "sailing", id, "box-cost-changes"],
    queryFn: () => api.shipments.coLoadingSailingBoxCostChanges(id),
    enabled: enabled && isUuid(id),
  });
  return { changes: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

/** What "Edit sailing" sends: the sailing's facts with its number of containers and its dates. */
export type SailingEditInput = { containerCount: number; cutoffDate: string | null; departureDate: string | null; vessel?: string; voyage?: string; pol?: string; pod?: string; hub?: string; containerType?: string };

/** "Edit sailing": all of the sailing. Every view of it is read again, and the shipments lists, which name it. */
export function useSailingDetails(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (details: SailingEditInput) => api.shipments.coLoadingSailingDetails(id, details),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: LIST_KEY }), qc.invalidateQueries({ queryKey: ["shipments"] })]),
  });
}

/** Removing a sailing made by mistake (managers and admins; an empty one only). The lists of sailings are read again. */
export function useSailingRemove(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.shipments.coLoadingSailingRemove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...LIST_KEY, "sailings"] }),
  });
}

/** A shipment's place in Co-Loading, as its own page shows it: the sailing it is on and the ones it could go on. */
export type ShipmentSailing = Awaited<ReturnType<typeof api.shipments.coLoadingShipmentSailing>>;
export type ShipmentSailingItem = ShipmentSailing["coming"][number];

/**
 * A shipment's sailing, for the shipment's page, with putting it on one, moving it and taking it
 * off from there. The same calls as on the sailing's own page, so the same checks hold. After each,
 * all of Co-Loading and the shipments lists are read again.
 */
export function useShipmentSailing(shipmentId: string, kind = "") {
  const qc = useQueryClient();
  const query = useQuery({
    // `kind`: what decides which sailings the shipment may go on (its Service Name, mode and load type), so a change of it reads again.
    queryKey: [...LIST_KEY, "of-shipment", shipmentId, kind],
    queryFn: () => api.shipments.coLoadingShipmentSailing(shipmentId),
    enabled: isUuid(shipmentId),
    // A box fills from other people's work: read again on coming back to the page.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });
  const settle = () => Promise.all([qc.invalidateQueries({ queryKey: LIST_KEY }), qc.invalidateQueries({ queryKey: ["shipments"] })]);
  const link = useMutation({ mutationFn: (sailingId: string) => api.shipments.coLoadingSailingLinkShipments(sailingId, { shipmentIds: [shipmentId] }), onSuccess: settle });
  const unlink = useMutation({ mutationFn: (sailingId: string) => api.shipments.coLoadingSailingUnlinkShipment(sailingId, shipmentId), onSuccess: settle });
  const move = useMutation({
    mutationFn: (input: { fromSailingId: string; toSailingId: string; reason: string }) =>
      api.shipments.coLoadingSailingMoveShipment(input.fromSailingId, shipmentId, { toSailingId: input.toSailingId, reason: input.reason }),
    onSuccess: settle,
  });
  return { place: query.data ?? null, isLoading: query.isLoading, isError: query.isError, link, unlink, move };
}

/** The shipments taken off a sailing, the last one first: who took each off, when and why. */
export function useSailingRemoved(id: string) {
  const query = useQuery({ queryKey: [...LIST_KEY, "sailing", id, "removed"], queryFn: () => api.shipments.coLoadingSailingRemoved(id), enabled: isUuid(id) });
  return { removed: query.data?.data ?? [], isError: query.isError };
}

/**
 * Linking shipments to a sailing (its box) and taking them off. The shipments lists are read again
 * after either: the sailing's Linked shipments and what Link shipments offers are both lists of them.
 */
export function useSailingShipmentLinks(sailingId: string) {
  const qc = useQueryClient();
  // The shipments lists, and the fill of the box the shipment joined or left.
  const settle = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["shipments"] }),
      // Everything read of this sailing: its fill, its removed list, and its earnings - the profit in its header moves too.
      qc.invalidateQueries({ queryKey: [...LIST_KEY, "sailing", sailingId] }),
      // The service's list of sailings shows each box's fill too.
      qc.invalidateQueries({ queryKey: [...LIST_KEY, "sailings"] }),
    ]);
  const link = useMutation({
    mutationFn: (shipmentIds: string[]) => api.shipments.coLoadingSailingLinkShipments(sailingId, { shipmentIds }),
    onSuccess: settle,
  });
  const unlink = useMutation({
    mutationFn: (shipmentId: string) => api.shipments.coLoadingSailingUnlinkShipment(sailingId, shipmentId),
    onSuccess: settle,
  });
  // The shipment leaves this sailing for another: both boxes change, so all of Co-Loading is read again.
  const move = useMutation({
    mutationFn: (input: { shipmentId: string; toSailingId: string; reason: string }) =>
      api.shipments.coLoadingSailingMoveShipment(sailingId, input.shipmentId, { toSailingId: input.toSailingId, reason: input.reason }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["shipments"] }), qc.invalidateQueries({ queryKey: LIST_KEY })]),
  });
  // Several at once, all or none (Council Outlay 14, A9).
  const settleAll = () => Promise.all([qc.invalidateQueries({ queryKey: ["shipments"] }), qc.invalidateQueries({ queryKey: LIST_KEY })]);
  const moveMany = useMutation({
    mutationFn: (input: { shipmentIds: string[]; toSailingId: string; reason: string }) => api.shipments.coLoadingSailingMoveShipments(sailingId, input),
    onSuccess: settleAll,
  });
  const unlinkMany = useMutation({
    mutationFn: (shipmentIds: string[]) => api.shipments.coLoadingSailingUnlinkShipments(sailingId, { shipmentIds }),
    onSuccess: settleAll,
  });
  return { link, unlink, move, moveMany, unlinkMany };
}

/** Linking shipments to whichever sailing is picked: for a list that is not one sailing's own (a service's waiting shipments). */
export function useLinkToSailing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sailingId: string; shipmentIds: string[] }) => api.shipments.coLoadingSailingLinkShipments(input.sailingId, { shipmentIds: input.shipmentIds }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["shipments"] }), qc.invalidateQueries({ queryKey: LIST_KEY })]),
  });
}

/**
 * A service's shipments on no sailing yet: its Service Name's jobs with no live link, the newest
 * 100, with how many there are in all. A shipments list, so a link reads it again.
 */
export function useWaitingShipments(serviceName: string, enabled = true) {
  const query = useQuery({
    queryKey: ["shipments", "co-loading-waiting", serviceName],
    queryFn: () => api.shipments.shipmentList({ serviceName, sailing: "none", limit: 100 }),
    enabled: enabled && !!serviceName,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { waiting: query.data?.data ?? [], total: query.data?.pagination.total ?? 0, isLoading: query.isLoading, isError: query.isError };
}

/**
 * What Link shipments offers: the service's own shipments (its Service Name) on no sailing yet,
 * searched on the server, the newest 100. A shipments list, so a link or a removal reads it again.
 */
export function useSailingCandidates(serviceName: string, search: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ["shipments", "sailing-picker", serviceName, search],
    queryFn: () => api.shipments.shipmentList({ search: search.trim() || undefined, serviceName, sailing: "none", limit: 100 }),
    enabled: enabled && !!serviceName,
  });
  return { candidates: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: query.refetch };
}

/**
 * The board of all services (Council Outlay 14, A6): their sailings still to come, and each
 * service's shipments waiting for a box. Boxes fill from other people's work, so it is read again
 * on opening and on coming back to the window. Under the Co-Loading key: every link, move and edit reads it again.
 */
export function useCoLoadingBoard() {
  const query = useQuery({
    queryKey: [...LIST_KEY, "board"],
    queryFn: () => api.shipments.coLoadingBoard(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { board: query.data ?? null, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}
export type BoardSailing = NonNullable<ReturnType<typeof useCoLoadingBoard>["board"]>["sailings"][number];

/** The profit of the board's sailings, by sailing id. Managers only: `enabled` keeps others from asking. */
export function useBoardProfits(enabled: boolean) {
  const query = useQuery({
    queryKey: [...LIST_KEY, "board", "profits"],
    queryFn: () => api.shipments.coLoadingBoardProfits(),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { profits: new Map((query.data?.data ?? []).map((p) => [p.sailingId, p])), isLoading: query.isLoading };
}

/**
 * A sailing's shipments beside its facts (Council Outlay 14, A3): what "Copy to linked shipments"
 * would change on each, and the ports that differ. Shipments are edited on their own pages, so it is
 * read again on opening and on coming back to the window.
 */
export function useSailingShipmentFacts(sailingId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [...LIST_KEY, "sailing", sailingId, "shipment-facts"],
    queryFn: () => api.shipments.coLoadingSailingShipmentFacts(sailingId),
    enabled: isUuid(sailingId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  // The shipments change: their lists and pages are read again, and the comparison with them.
  const copy = useMutation({
    mutationFn: (shipmentIds: string[]) => api.shipments.coLoadingSailingCopyToShipments(sailingId, { shipmentIds }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["shipments"] }), qc.invalidateQueries({ queryKey: [...LIST_KEY, "sailing", sailingId] })]),
  });
  return { facts: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isError, copy };
}
export type SailingShipmentFacts = ReturnType<typeof useSailingShipmentFacts>["facts"][number];
