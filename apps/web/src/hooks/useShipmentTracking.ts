"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { interfaces } from "@/lib/api/client";

export type ShipmentTracking = interfaces.ShipmentTracking;
export type TrackingMilestone = interfaces.TrackingMilestone;
export type TrackingChange = interfaces.TrackingChange;
export type TrackingAttention = interfaces.TrackingAttention;
export type TrackingTick = interfaces.TrackingTick;
export type TrackingTaxDate = interfaces.TrackingTaxDate;
export type TrackingRecorded = interfaces.TrackingRecorded;
export type TrackingEventItem = interfaces.TrackingEventItem;
export type TrackingRecordableKind = interfaces.TrackingRecordableKind;
export type TrackingCustomerNotice = interfaces.TrackingCustomerNotice;
export type TrackingBellNotice = interfaces.TrackingBellNotice;
export type TrackingReadFact = interfaces.TrackingReadFact;
export type TrackingReadingPreview = interfaces.TrackingReadingPreview;
export type MasterJobTrackingHouse = interfaces.MasterJobTrackingHouse;

export interface CustomerNoticeInput {
  kind: string;
  channel: string;
  toldTo?: string;
  subject?: string;
  note?: string;
  taskKey?: string;
}

const BELL_KEY = ["tracking-bell"] as const;

/** The bell: moved dates, dates to confirm, and what the customer was told that no longer holds. */
export function useTrackingBell() {
  const query = useQuery({
    queryKey: BELL_KEY,
    queryFn: async () => (await api.shipments.trackingBellNotices()).notices,
    refetchInterval: 30_000,
  });
  return { notices: query.data ?? [], hasLoaded: query.data !== undefined };
}

export interface RecordEventInput {
  kind: string;
  occurredOn: string;
  occurredTime?: string;
  place?: string;
  containerNumber?: string;
  note?: string;
  taskKey?: string;
}

/** The shipment's dated facts. Other modules and other people write them too, so each opening reads them anew. */
export function useShipmentTracking(shipmentId: string) {
  return useQuery({
    queryKey: ["shipment-tracking", shipmentId],
    queryFn: () => api.shipments.shipmentTracking(shipmentId),
    enabled: !!shipmentId,
    staleTime: 0,
  });
}

/** A master job's houses, each with where it stands. */
export function useMasterJobTracking(masterJobId: string) {
  return useQuery({
    queryKey: ["master-job-tracking", masterJobId],
    queryFn: async () => (await api.shipments.masterJobTracking(masterJobId)).houses,
    staleTime: 0,
  });
}

/** What was read from a notice, in the shipment's terms. Nothing is kept yet. */
export const readTrackingNotice = async (shipmentId: string, source: { text: string } | { fileBase64: string; fileName: string }): Promise<TrackingReadingPreview> => {
  const read = "text" in source ? await api.extraction.extractText({ text: source.text, destination: "tracking" }) : await api.extraction.extractTracking(source);
  return api.shipments.trackingReadingPreview(shipmentId, { extracted: read.extracted });
};

/** What people do with the shipment's events. An event can set a date and tick a task, so those are read anew too. */
export function useTrackingActions(shipmentId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: ["shipment-tracking", shipmentId] });
    queryClient.invalidateQueries({ queryKey: ["shipment-tasks", shipmentId] });
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    queryClient.invalidateQueries({ queryKey: BELL_KEY });
  };
  const onError = (err: unknown) => toast.error(apiErrorMessage(err));

  return {
    /** Opening the tab: what the bell says about this shipment is no longer new. */
    markRead: useMutation({
      mutationFn: () => api.shipments.trackingMarkRead(shipmentId),
      onSettled: () => queryClient.invalidateQueries({ queryKey: BELL_KEY }),
    }),
    /** Says nothing on failure: the dialog stays open and shows why. */
    tellCustomer: useMutation({ mutationFn: (input: CustomerNoticeInput) => api.shipments.customerNoticeRecord(shipmentId, input), onSettled }),
    /** Says nothing on failure: the dialog that records stays open and shows why. */
    record: useMutation({ mutationFn: (input: RecordEventInput) => api.shipments.trackingEventRecord(shipmentId, input), onSettled }),
    confirm: useMutation({ mutationFn: (eventId: string) => api.shipments.trackingEventConfirm(shipmentId, eventId), onSettled, onError }),
    dismiss: useMutation({ mutationFn: (eventId: string) => api.shipments.trackingEventDismiss(shipmentId, eventId), onSettled, onError }),
    resolve: useMutation({ mutationFn: (eventId: string) => api.shipments.trackingEventResolve(shipmentId, eventId), onSettled, onError }),
    /** Says nothing on failure: the dialog stays open and shows why. */
    keepReading: useMutation({
      mutationFn: (input: { facts: TrackingReadFact[]; file?: { fileName: string; fileType: string; contentBase64: string }; vesselChange?: interfaces.TrackingVesselChange }) =>
        api.shipments.trackingReadingKeep(shipmentId, {
          facts: input.facts.map((f) => ({ kind: f.kind, occurredOn: f.occurredOn, place: f.place, vessel: f.vessel, note: f.note })),
          file: input.file,
          vesselChange: input.vesselChange,
        }),
      onSettled,
    }),
    /** Says nothing on failure: the dialog that asks why stays open and shows it. */
    strike: useMutation({
      mutationFn: ({ eventId, reason }: { eventId: string; reason: string }) => api.shipments.trackingEventStrike(shipmentId, eventId, { reason }),
      onSettled,
    }),
    /** Says nothing on failure: the dialog that asks why stays open and shows it. */
    reopenTask: useMutation({
      mutationFn: ({ taskKey, reason }: { taskKey: string; reason: string }) => api.shipments.taskReopen(shipmentId, taskKey, { reason }),
      onSettled,
    }),
  };
}
