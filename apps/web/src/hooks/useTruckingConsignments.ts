"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, publicApi } from "@/lib/api";
import { truckingKeys } from "./truckingKeys";

// Consignments, FTL trips, transport orders, documents and the haulier's public link (Phase 4).
// Every shape is taken from the client methods, so the screens follow the API when the client is
// regenerated.

type ListResponse = Awaited<ReturnType<typeof api.trucking.truckingConsignmentList>>;
export type ConsignmentListRequest = Parameters<typeof api.trucking.truckingConsignmentList>[0];
export type ConsignmentListItem = ListResponse["consignments"][number];
export type ConsignmentCounts = ListResponse["counts"];
export type ConsignmentDetail = Awaited<ReturnType<typeof api.trucking.truckingConsignmentGet>>["consignment"];
export type ConsignmentStatus = ConsignmentListItem["status"];
export type ConsignmentView = NonNullable<ConsignmentListRequest["view"]>;
export type ConsignmentCreate = Parameters<typeof api.trucking.truckingConsignmentCreate>[0];
export type ConsignmentUpdate = Parameters<typeof api.trucking.truckingConsignmentUpdate>[1];
export type ConsignmentPrice = ConsignmentCreate["price"];
export type StopInput = ConsignmentCreate["pickup"];
export type LoadInput = ConsignmentCreate["load"];
// The stamp a path names: the client types a path part as plain text, the stamps say which exist.
export type StampKind = keyof ConsignmentDetail["stamps"];
export type PriceSnapshot = NonNullable<ConsignmentDetail["sell"]>;
export type TruckingEvent = ConsignmentDetail["events"][number];
export type TripDetail = Awaited<ReturnType<typeof api.trucking.truckingTripGet>>["trip"];
export type TripListItem = Awaited<ReturnType<typeof api.trucking.truckingTripList>>["trips"][number];
export type TripStatus = TripDetail["status"];
export type TripCreateFtl = Parameters<typeof api.trucking.truckingTripCreateFtl>[0];
export type TripUpdate = Parameters<typeof api.trucking.truckingTripUpdate>[1];
export type TransportOrderPdfRequest = Parameters<typeof api.trucking.truckingTransportOrderPdf>[1];
export type TransportOrderSendRequest = Parameters<typeof api.trucking.truckingTransportOrderSend>[1];
export type TransportOrderLanguage = TransportOrderPdfRequest["language"];
export type TruckingDocument = Awaited<ReturnType<typeof api.trucking.truckingDocumentList>>["documents"][number];
export type DocumentUpload = Parameters<typeof api.trucking.truckingDocumentUpload>[1];
export type DocumentKind = DocumentUpload["kind"];
export type TruckingFile = Awaited<ReturnType<typeof api.trucking.truckingCmrPdf>>["file"];
export type ConsignmentScope = ConsignmentDetail["scope"];
export type LastMile = ConsignmentDetail["lastMile"];
export type Leg = ConsignmentDetail["legs"][number];
export type TripKind = TripDetail["kind"];
export type TripLeg = TripDetail["legs"][number];
export type TripFill = TripDetail["fill"];
export type TripStampKind = keyof TripDetail["stamps"];
export type TripPrice = Parameters<typeof api.trucking.truckingTripReprice>[1]["price"];
export type PlanningBoardRequest = Parameters<typeof api.trucking.truckingPlanningBoard>[0];
export type LtlTripKind = PlanningBoardRequest["kind"];
export type PlanningBoard = Awaited<ReturnType<typeof api.trucking.truckingPlanningBoard>>;
export type PlanningLeg = PlanningBoard["unplanned"][number];
export type PlanningTrip = PlanningBoard["trips"][number];
export type TripCreateLtl = Parameters<typeof api.trucking.truckingTripCreateLtl>[0];
export type TripAssignLegs = Parameters<typeof api.trucking.truckingTripAssignLegs>[1];
export type LegPartnerRequest = Parameters<typeof api.trucking.truckingLegPartner>[1];
export type ManifestLanguage = Parameters<typeof api.trucking.truckingManifestPdf>[1]["language"];
export type LabelsRequest = Parameters<typeof api.trucking.truckingLabelsPdf>[0];
export type PublicTransportOrder = Awaited<ReturnType<typeof publicApi.trucking.publicTransportOrderGet>>["order"];
export type PublicRespond = Parameters<typeof publicApi.trucking.publicTransportOrderRespond>[1];
export type PublicPod = Parameters<typeof publicApi.trucking.publicTransportOrderPod>[1];

const NO_CONSIGNMENTS: ConsignmentListItem[] = [];
const NO_TRIPS: TripListItem[] = [];
const NO_DOCUMENTS: TruckingDocument[] = [];

/** The consignments of a view, status, search or job, with the counts of the tiles and chips. */
export function useConsignments(filters: ConsignmentListRequest = {}, { enabled = true } = {}) {
  const key = { view: filters.view, status: filters.status, search: filters.search, shipmentId: filters.shipmentId };
  const query = useQuery({
    queryKey: truckingKeys.consignmentList(key),
    queryFn: () => api.trucking.truckingConsignmentList(filters),
    enabled,
    // A chip switched keeps the rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
  return {
    consignments: query.data?.consignments ?? NO_CONSIGNMENTS,
    counts: query.data?.counts ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/** A change to a consignment or trip moves both lists, the planning board and the job's cards, so every list is read again. */
export function useRefreshLists() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: truckingKeys.consignments() }),
      queryClient.invalidateQueries({ queryKey: truckingKeys.trips() }),
      queryClient.invalidateQueries({ queryKey: truckingKeys.planning() }),
      // The job (dates, plate, status) and its costs are written by the server from Trucking.
      queryClient.invalidateQueries({ queryKey: ["shipments"] }),
      queryClient.invalidateQueries({ queryKey: ["invoicing"] }),
    ]);
}

export function useCreateConsignment() {
  const queryClient = useQueryClient();
  const refreshLists = useRefreshLists();
  const create = useMutation({
    mutationFn: (req: ConsignmentCreate) => api.trucking.truckingConsignmentCreate(req),
    onSuccess: (res) => {
      queryClient.setQueryData(truckingKeys.consignment(res.consignment.id), res);
      return refreshLists();
    },
  });
  return { create: create.mutateAsync, isCreating: create.isPending };
}

/** One consignment and what is done with it; every answer is the consignment as stored now. */
export function useConsignment(id: string) {
  const queryClient = useQueryClient();
  const refreshLists = useRefreshLists();
  const query = useQuery({
    queryKey: truckingKeys.consignment(id),
    queryFn: () => api.trucking.truckingConsignmentGet(id),
    enabled: !!id,
    retry: false,
  });

  const onChanged = (res: { consignment: ConsignmentDetail }) => {
    queryClient.setQueryData(truckingKeys.consignment(id), { consignment: res.consignment });
    return refreshLists();
  };

  const update = useMutation({ mutationFn: (req: ConsignmentUpdate) => api.trucking.truckingConsignmentUpdate(id, req), onSuccess: onChanged });
  const cancel = useMutation({ mutationFn: (reason: string) => api.trucking.truckingConsignmentCancel(id, { reason }), onSuccess: onChanged });
  const approveMargin = useMutation({ mutationFn: (reason: string) => api.trucking.truckingConsignmentApproveMargin(id, { reason }), onSuccess: onChanged });
  const stamp = useMutation({
    mutationFn: ({ kind, at }: { kind: StampKind; at: string | null }) => api.trucking.truckingConsignmentStamp(id, kind, { at }),
    onSuccess: onChanged,
  });
  const voidStamp = useMutation({
    mutationFn: ({ kind, reason }: { kind: StampKind; reason: string }) => api.trucking.truckingConsignmentVoidStamp(id, kind, { reason }),
    onSuccess: onChanged,
  });
  // A partner delivery leg (LTL, last mile Partner network): partner haulier, depot and price.
  const legPartner = useMutation({
    mutationFn: ({ legId, req }: { legId: string; req: LegPartnerRequest }) => api.trucking.truckingLegPartner(legId, req),
    onSuccess: onChanged,
  });
  const planTrip = useMutation({
    mutationFn: (req: Omit<TripCreateFtl, "consignmentId">) => api.trucking.truckingTripCreateFtl({ ...req, consignmentId: id }),
    onSuccess: (res) => {
      queryClient.setQueryData(truckingKeys.trip(res.trip.id), { trip: res.trip });
      return onChanged(res);
    },
  });

  return {
    consignment: query.data?.consignment ?? null,
    isLoading: query.isLoading,
    error: query.error,
    reload: query.refetch,
    update: update.mutateAsync,
    isUpdating: update.isPending,
    cancel: cancel.mutateAsync,
    approveMargin: approveMargin.mutateAsync,
    stamp: stamp.mutateAsync,
    isStamping: stamp.isPending,
    voidStamp: voidStamp.mutateAsync,
    planTrip: planTrip.mutateAsync,
    isPlanning: planTrip.isPending,
    setLegPartner: legPartner.mutateAsync,
  };
}

/** The CMR of a consignment, made on click. */
export const fetchConsignmentCmr = async (id: string): Promise<TruckingFile> => (await api.trucking.truckingCmrPdf(id)).file;

export function useTrips(filters: Parameters<typeof api.trucking.truckingTripList>[0] = {}) {
  const query = useQuery({
    queryKey: truckingKeys.tripList({ status: filters.status, search: filters.search }),
    queryFn: () => api.trucking.truckingTripList(filters),
  });
  return { trips: query.data?.trips ?? NO_TRIPS, isLoading: query.isLoading, isError: query.isError };
}

/** One trip and its transport order; `enabled: false` asks nothing (a consignment without a trip). */
export function useTrip(id: string | null) {
  const queryClient = useQueryClient();
  const refreshLists = useRefreshLists();
  const query = useQuery({
    queryKey: truckingKeys.trip(id ?? ""),
    queryFn: () => api.trucking.truckingTripGet(id as string),
    enabled: !!id,
    retry: false,
  });

  // The trip's answers carry the trip only; its consignments changed status with it, so they are read again.
  const onChanged = (res: { trip: TripDetail }) => {
    queryClient.setQueryData(truckingKeys.trip(res.trip.id), { trip: res.trip });
    return refreshLists();
  };

  const update = useMutation({ mutationFn: (req: TripUpdate) => api.trucking.truckingTripUpdate(id as string, req), onSuccess: onChanged });
  const reprice = useMutation({ mutationFn: (price: TripPrice) => api.trucking.truckingTripReprice(id as string, { price }), onSuccess: onChanged });
  const assignLegs = useMutation({ mutationFn: (req: TripAssignLegs) => api.trucking.truckingTripAssignLegs(id as string, req), onSuccess: onChanged });
  const tripStamp = useMutation({
    mutationFn: ({ kind, at }: { kind: TripStampKind; at: string | null }) => api.trucking.truckingTripStamp(id as string, kind, { at }),
    onSuccess: onChanged,
  });
  const cancel = useMutation({ mutationFn: (reason: string) => api.trucking.truckingTripCancel(id as string, { reason }), onSuccess: onChanged });
  const send = useMutation({ mutationFn: (req: TransportOrderSendRequest) => api.trucking.truckingTransportOrderSend(id as string, req), onSuccess: onChanged });
  const confirm = useMutation({ mutationFn: (note: string) => api.trucking.truckingTransportOrderConfirm(id as string, { note }), onSuccess: onChanged });
  // Printing changes nothing but the history (an event "transport order printed").
  const print = useMutation({
    mutationFn: (req: TransportOrderPdfRequest) => api.trucking.truckingTransportOrderPdf(id as string, req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: truckingKeys.trip(id ?? "") }),
  });

  return {
    trip: query.data?.trip ?? null,
    isLoading: query.isLoading,
    error: query.error,
    save: update.mutateAsync,
    isSaving: update.isPending,
    cancel: cancel.mutateAsync,
    send: send.mutateAsync,
    confirm: confirm.mutateAsync,
    print: print.mutateAsync,
    reprice: reprice.mutateAsync,
    assignLegs: assignLegs.mutateAsync,
    isAssigning: assignLegs.isPending,
    stamp: tripStamp.mutateAsync,
    isStamping: tripStamp.isPending,
  };
}

export function useConsignmentDocuments(consignmentId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: truckingKeys.consignmentDocuments(consignmentId),
    queryFn: () => api.trucking.truckingDocumentList(consignmentId),
    enabled: !!consignmentId,
  });
  const upload = useMutation({
    mutationFn: (req: DocumentUpload) => api.trucking.truckingDocumentUpload(consignmentId, req),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: truckingKeys.consignmentDocuments(consignmentId) }),
        queryClient.invalidateQueries({ queryKey: truckingKeys.consignment(consignmentId) }),
      ]),
  });
  return {
    documents: query.data?.documents ?? NO_DOCUMENTS,
    isLoading: query.isLoading,
    upload: upload.mutateAsync,
    isUploading: upload.isPending,
  };
}

/** The manifest (loading list) of a trip, made on click. */
export const fetchTripManifest = async (tripId: string, language: ManifestLanguage): Promise<TruckingFile> => (await api.trucking.truckingManifestPdf(tripId, { language })).file;

/** Labels (100 × 150 mm) of consignments, made on click. */
export const fetchConsignmentLabels = async (req: LabelsRequest): Promise<TruckingFile> => (await api.trucking.truckingLabelsPdf(req)).file;

/** One document's file, fetched on click. */
export const fetchTruckingDocument = async (docId: string): Promise<TruckingFile> => (await api.trucking.truckingDocumentContent(docId)).file;

/** The transport order behind a haulier's link (public: no session is sent). */
export function usePublicTransportOrder(token: string) {
  const queryClient = useQueryClient();
  const key = truckingKeys.publicOrder(token);
  const query = useQuery({
    queryKey: key,
    queryFn: () => publicApi.trucking.publicTransportOrderGet(token),
    enabled: !!token,
    retry: false,
  });
  const onChanged = (res: { order: PublicTransportOrder }) => queryClient.setQueryData(key, res);
  const respond = useMutation({ mutationFn: (req: PublicRespond) => publicApi.trucking.publicTransportOrderRespond(token, req), onSuccess: onChanged });
  const pod = useMutation({ mutationFn: (req: PublicPod) => publicApi.trucking.publicTransportOrderPod(token, req), onSuccess: onChanged });
  return {
    order: query.data?.order ?? null,
    isLoading: query.isLoading,
    error: query.error,
    respond: respond.mutateAsync,
    isResponding: respond.isPending,
    uploadPod: pod.mutateAsync,
    isUploading: pod.isPending,
  };
}
