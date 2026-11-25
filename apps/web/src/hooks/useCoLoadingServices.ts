"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { isUuid } from "@/lib/uuid";

export type CoLoadingService = interfaces.CoLoadingServiceItem;
export type CoLoadingServiceNew = controllers.CoLoadingServiceCreateRequest;

const LIST_KEY = ["co-loading-services"] as const;

/** What every Co-Loading query's key starts with: a shipment write elsewhere marks them all stale (useShipments). */
export const CO_LOADING_KEY = LIST_KEY;

/**
 * The key of one sailing's own read, and with `view` of every other view of it (its fill, earnings,
 * checklist and history, customer notices, Master Job...): all start with the sailing's, so a write
 * that reads the sailing again reads each of them again too.
 */
export const sailingKey = (id: string, ...view: string[]) => [...LIST_KEY, "sailing", id, ...view];

/** What linking shipments to a sailing or taking them off leaves stale: see useSailingShipmentLinks. */
export function invalidateAfterSailingLinks(qc: QueryClient, sailingId: string) {
  return Promise.all([
    // The shipments lists: the sailing's Linked shipments and what Link shipments offers are both lists of them.
    qc.invalidateQueries({ queryKey: ["shipments"] }),
    // Everything read of this sailing: its fill, its removed list, its earnings (the profit in its header moves too),
    // its history, its customers to tell and its Master Job's list of the sailing's shipments.
    qc.invalidateQueries({ queryKey: sailingKey(sailingId) }),
    // The service's list of sailings shows each box's fill too.
    qc.invalidateQueries({ queryKey: [...LIST_KEY, "sailings"] }),
  ]);
}

/**
 * Every sailing's customer notices: a "sailed" or "rolled" notice recorded on a shipment's own page
 * (Tell the customer) stands on its sailing's Customers to tell too. Which sailing is not known there,
 * so all of them; only the ones on screen are read at once.
 */
export const invalidateSailingNotices = (qc: QueryClient) =>
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === LIST_KEY[0] && q.queryKey[1] === "sailing" && q.queryKey[3] === "notices" });

/** A tick or a note saved: the log as the server gives it back, and the Earnings record of changes, which words a tick and a note too. */
export function afterSailingLogWrite(qc: QueryClient, id: string, log: interfaces.SailingLog) {
  qc.setQueryData(sailingKey(id, "log"), log);
  return qc.invalidateQueries({ queryKey: sailingKey(id, "box-cost-changes") });
}

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
  // The steps of the sailings' checklist, for import or for export services: every sailing's checklist is read again.
  const saveChecklist = useMutation({
    mutationFn: (input: { direction: "import" | "export"; steps: string[] }) => api.shipments.coLoadingSettingsChecklist(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
  return { settings: query.data ?? null, isLoading: query.isLoading, isError: query.isError, save, saveChecklist };
}

/**
 * A sailing's checklist, hand-over note and history (Council Outlay 14, C5), with the tick and the
 * note to set. Under the sailing's key: a link, a move or an edit of the sailing reads it again.
 */
export function useSailingLog(id: string) {
  const qc = useQueryClient();
  const key = sailingKey(id, "log");
  const query = useQuery({ queryKey: key, queryFn: () => api.shipments.coLoadingSailingLog(id), enabled: !!id });
  const took = (log: interfaces.SailingLog) => afterSailingLogWrite(qc, id, log);
  const tick = useMutation({ mutationFn: (input: { step: string; done: boolean }) => api.shipments.coLoadingSailingTick(id, input), onSuccess: took });
  // `expected`: the note the box started from (lib sailingLog noteRequest). A note a colleague changed meanwhile is refused;
  // the log is then read again, so theirs shows beside what was typed.
  const note = useMutation({
    mutationFn: (input: { note: string; expected: string }) => api.shipments.coLoadingSailingNote(id, input),
    onSuccess: took,
    onError: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { log: query.data ?? null, isLoading: query.isLoading, isError: query.isError, tick, note };
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
  return { sailings: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isError, error: query.error, create };
}

/** One sailing, for its own page. */
export function useCoLoadingSailing(id: string) {
  const isId = isUuid(id);
  const query = useQuery({
    queryKey: sailingKey(id),
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
    queryKey: sailingKey(id, "utilization"),
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
    queryKey: sailingKey(id, "earnings"),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: sailingKey(id) }),
  });
}

/** Every change of a sailing's box costs, the last one first; read only once asked for. */
export function useSailingBoxCostChanges(id: string, enabled: boolean) {
  const query = useQuery({
    queryKey: sailingKey(id, "box-cost-changes"),
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

/** Setting a sailing's stage by hand (Council Outlay 14, C3). Every view of the sailing is read again: its lists, the board, a shipment's chip. */
export function useSailingStage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: string) => api.shipments.coLoadingSailingStage(id, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
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

/** What decides which sailings a shipment may go on - its Service Name, mode and load type - in one text: part of the key of its sailing's read, so a change of it reads again. */
export const shipmentSailingKind = (s: { serviceName?: string | null; freightMode?: string | null; loadType?: string | null }): string =>
  [s.serviceName, s.freightMode, s.loadType].map((v) => (v ?? "").trim()).join("|");

const shipmentSailingKey = (shipmentId: string, kind: string) => [...LIST_KEY, "of-shipment", shipmentId, kind];

/**
 * A shipment's sailing, for the shipment's page, with putting it on one, moving it and taking it
 * off from there. The same calls as on the sailing's own page, so the same checks hold. After each,
 * all of Co-Loading and the shipments lists are read again.
 */
export function useShipmentSailing(shipmentId: string, kind = "") {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: shipmentSailingKey(shipmentId, kind),
    queryFn: () => api.shipments.coLoadingShipmentSailing(shipmentId),
    enabled: isUuid(shipmentId),
    // A box fills from other people's work: read again on coming back to the page.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });
  const settle = () => Promise.all([qc.invalidateQueries({ queryKey: LIST_KEY }), qc.invalidateQueries({ queryKey: ["shipments"] })]);
  const link = useMutation({ mutationFn: (input: { sailingId: string; reason?: string }) => api.shipments.coLoadingSailingLinkShipments(input.sailingId, { shipmentIds: [shipmentId], reason: input.reason }), onSuccess: settle });
  const unlink = useMutation({ mutationFn: (sailingId: string) => api.shipments.coLoadingSailingUnlinkShipment(sailingId, shipmentId), onSuccess: settle });
  const move = useMutation({
    mutationFn: (input: { fromSailingId: string; toSailingId: string; reason: string }) =>
      api.shipments.coLoadingSailingMoveShipment(input.fromSailingId, shipmentId, { toSailingId: input.toSailingId, reason: input.reason }),
    onSuccess: settle,
  });
  // A failed first read is said (isLoadingError); a failed refresh keeps the sailing as last read.
  return { place: query.data ?? null, isLoading: query.isLoading, isError: query.isLoadingError, error: query.error, link, unlink, move };
}

/**
 * The sailing a shipment is on now, as its page's header (ShipmentSailingChip) has read it: taken
 * from that read and never asked for again here (`enabled: false`), so a dialog of the page adds no
 * request. Null while the header has not read it, or when the shipment is on no sailing.
 */
export function useShipmentSailingOnPage(shipment: { id: string; serviceName?: string | null; freightMode?: string | null; loadType?: string | null }) {
  const query = useQuery({
    queryKey: shipmentSailingKey(shipment.id, shipmentSailingKind(shipment)),
    queryFn: () => api.shipments.coLoadingShipmentSailing(shipment.id),
    enabled: false,
  });
  return query.data?.on ?? null;
}

/** The shipments taken off a sailing, the last one first: who took each off, when and why. */
export function useSailingRemoved(id: string) {
  const query = useQuery({ queryKey: sailingKey(id, "removed"), queryFn: () => api.shipments.coLoadingSailingRemoved(id), enabled: isUuid(id) });
  return { removed: query.data?.data ?? [], isError: query.isError };
}

/**
 * Linking shipments to a sailing (its box) and taking them off. The shipments lists are read again
 * after either: the sailing's Linked shipments and what Link shipments offers are both lists of them.
 */
export function useSailingShipmentLinks(sailingId: string) {
  const qc = useQueryClient();
  const settle = () => invalidateAfterSailingLinks(qc, sailingId);
  const link = useMutation({
    mutationFn: (input: { shipmentIds: string[]; reason?: string }) => api.shipments.coLoadingSailingLinkShipments(sailingId, input),
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
    mutationFn: (input: { sailingId: string; shipmentIds: string[]; reason?: string }) => api.shipments.coLoadingSailingLinkShipments(input.sailingId, { shipmentIds: input.shipmentIds, reason: input.reason }),
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
  // A failed first read is said (isLoadingError); a failed refresh keeps the list as last read.
  return { waiting: query.data?.data ?? [], total: query.data?.pagination.total ?? 0, isLoading: query.isLoading, isError: query.isLoadingError, error: query.error };
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
    queryKey: sailingKey(sailingId, "shipment-facts"),
    queryFn: () => api.shipments.coLoadingSailingShipmentFacts(sailingId),
    enabled: isUuid(sailingId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  // The shipments change: their lists and pages are read again, and the comparison with them.
  const copy = useMutation({
    mutationFn: (shipmentIds: string[]) => api.shipments.coLoadingSailingCopyToShipments(sailingId, { shipmentIds }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["shipments"] }), qc.invalidateQueries({ queryKey: sailingKey(sailingId) })]),
  });
  // A failed first read is said (isLoadingError): no facts then is not "nothing differs". A failed refresh keeps them as last read.
  return { facts: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isLoadingError, error: query.error, copy };
}
export type SailingShipmentFacts = ReturnType<typeof useSailingShipmentFacts>["facts"][number];

/** A sailing's customer notices (Council Outlay 14, C6): who was told the cargo sailed or was rolled, and the recording of it for several shipments. */
export function useSailingNotices(id: string) {
  const qc = useQueryClient();
  const key = sailingKey(id, "notices");
  const query = useQuery({ queryKey: key, queryFn: () => api.shipments.coLoadingSailingNotices(id), enabled: !!id });
  const record = useMutation({
    mutationFn: (input: { kind: "sailed" | "rolled"; shipmentIds: string[]; channel: string; note?: string }) => api.shipments.coLoadingSailingNoticesRecord(id, input),
    // The notices stand on each shipment's Tracking tab too: those are read again.
    onSuccess: (notices) => {
      qc.setQueryData(key, notices);
      return qc.invalidateQueries({ queryKey: ["shipment-tracking"] });
    },
  });
  return { notices: query.data ?? null, isLoading: query.isLoading, isError: query.isError, record };
}

/**
 * A sailing's Master Job (Council Outlay 14, C2): read, made from the sailing's shipments, linked by its MCZ number, more shipments put on it, unlinked.
 * A Master Job writes onto its shipments, so the shipments lists, the Master Jobs and every view of the sailing are read again.
 * Under the sailing's key: its list of the sailing's shipments is read again when one is linked, moved or taken off.
 */
export function useSailingMasterJob(id: string) {
  const qc = useQueryClient();
  const key = sailingKey(id, "master-job");
  const query = useQuery({ queryKey: key, queryFn: () => api.shipments.coLoadingSailingMasterJob(id), enabled: !!id });
  const settle = (now: interfaces.SailingMasterJob) => {
    qc.setQueryData(key, now);
    return Promise.all([qc.invalidateQueries({ queryKey: LIST_KEY }), qc.invalidateQueries({ queryKey: ["shipments"] }), qc.invalidateQueries({ queryKey: ["master-jobs"] })]);
  };
  // A refused change may still have changed something (a Master Job made, its shipments not linked): read again either way.
  const reread = () => qc.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: (shipmentIds: string[]) => api.shipments.coLoadingSailingMasterJobSet(id, { shipmentIds }), onSuccess: settle, onError: reread });
  const link = useMutation({ mutationFn: (mczNumber: string) => api.shipments.coLoadingSailingMasterJobSet(id, { mczNumber }), onSuccess: settle, onError: reread });
  const putOn = useMutation({ mutationFn: (shipmentIds: string[]) => api.shipments.coLoadingSailingMasterJobShipments(id, { shipmentIds }), onSuccess: settle, onError: reread });
  const unlink = useMutation({ mutationFn: () => api.shipments.coLoadingSailingMasterJobUnlink(id), onSuccess: settle });
  return { data: query.data ?? null, isLoading: query.isLoading, isError: query.isError, create, link, putOn, unlink };
}

/** A service's money settings (Council Outlay 14, B4), for managers: the box costs a new sailing starts with, and the minimum earning per W/M. Saving reads every sailing's earnings again. */
export function useServiceMoney(serviceId: string, enabled: boolean) {
  const qc = useQueryClient();
  const key = [...LIST_KEY, "service-money", serviceId];
  const query = useQuery({ queryKey: key, queryFn: () => api.shipments.coLoadingServiceMoney(serviceId), enabled: enabled && isUuid(serviceId) });
  const save = useMutation({
    mutationFn: (money: { defaultBoxCosts: { kind: string; amount: number | null; currency: string; note: string }[] | null; minEarningPerWm: number | null }) => api.shipments.coLoadingServiceMoneySet(serviceId, money),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
  return { money: query.data ?? null, isLoading: query.isLoading, isError: query.isError, save };
}

/** A service's trend (Council Outlay 14, B5), for managers: live figures, read again when the page is looked at. */
export function useServiceTrend(serviceId: string, enabled: boolean) {
  const query = useQuery({ queryKey: [...LIST_KEY, "service-trend", serviceId], queryFn: () => api.shipments.coLoadingServiceTrend(serviceId), enabled: enabled && isUuid(serviceId), staleTime: 0, refetchOnWindowFocus: true });
  return { trend: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}
