// What the customer was told about a shipment, and whether the dates have moved since (Council
// Outlay 8, D10, D12, D13). The app can't send e-mail: the user's own mail program or phone does,
// and their word that it went is what is recorded. Pure, so it is unit-tested.

import type { ShipmentRecord } from "../schemas/shipment.schema";
import type { ShipmentCustomerNoticeRecord } from "../schemas/shipmentCustomerNotice.schema";

export const NOTICE_KINDS = {
  status: "Status update",
  arrival_notice: "Arrival notice",
  eta_change: "ETA change",
  delivery_advice: "Delivery advice",
  pod_sent: "POD sent",
  draft_sent: "BoL draft sent",
  bl_provided: "Bill of Lading provided",
} as const;

export type NoticeKind = keyof typeof NOTICE_KINDS;

export const NOTICE_CHANNELS = ["email", "phone", "other"] as const;
export type NoticeChannel = (typeof NOTICE_CHANNELS)[number];

export const isNoticeKind = (kind: string): kind is NoticeKind => Object.hasOwn(NOTICE_KINDS, kind);
export const isNoticeChannel = (channel: string): channel is NoticeChannel => (NOTICE_CHANNELS as readonly string[]).includes(channel);

/** Worth a line in the Customer Database's Communication log; a plain status mail would bury sales' own notes (D13). */
export const LOGGED_NOTICE_KINDS: ReadonlySet<string> = new Set<NoticeKind>(["arrival_notice", "eta_change", "pod_sent"]);

/** A checklist tick that means the customer was told: the notice writes the tick. */
export const TICK_NOTICES: Readonly<Record<string, NoticeKind>> = {
  imp_arrival_notice: "arrival_notice",
  exp_draft_sent: "draft_sent",
  exp_bl_provided: "bl_provided",
};

/** The dates a notice keeps a copy of, as the shipment holds them now. */
export function datesToTell(s: Pick<ShipmentRecord, "estimatedArrival" | "etaWarehouse" | "plannedDeliveryDate">) {
  return { etaPod: s.estimatedArrival, etaWarehouse: s.etaWarehouse, plannedDelivery: s.plannedDeliveryDate };
}

export interface ToldDifference {
  what: string;
  field: "estimatedArrival" | "etaWarehouse" | "plannedDeliveryDate";
  told: string;
  now: string | null;
}

type DatesNow = Pick<ShipmentRecord, "estimatedArrival" | "actualArrival" | "etaWarehouse" | "warehouseReceivedDate" | "plannedDeliveryDate" | "actualDeliveryDate">;

/**
 * Where the shipment's dates have moved away from what the customer was told. Only what was told
 * counts, and a plan is no longer news once the real date is known.
 */
export function toldDifferences(notice: Pick<ShipmentCustomerNoticeRecord, "etaPod" | "etaWarehouse" | "plannedDelivery">, s: DatesNow): ToldDifference[] {
  const out: ToldDifference[] = [];
  const check = (what: string, field: ToldDifference["field"], told: string | null, now: string | null, happened: string | null) => {
    if (told && !happened && told !== now) out.push({ what, field, told, now });
  };
  check("ETA", "estimatedArrival", notice.etaPod, s.estimatedArrival, s.actualArrival);
  check("ETA warehouse", "etaWarehouse", notice.etaWarehouse, s.etaWarehouse, s.warehouseReceivedDate);
  check("Delivery", "plannedDeliveryDate", notice.plannedDelivery, s.plannedDeliveryDate, s.actualDeliveryDate);
  return out;
}

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** The line a notice leaves in the Customer Database's Communication log. */
export function communicationLogText(
  kind: NoticeKind,
  jobNumber: string,
  toldTo: string,
  dates: { etaPod: string | null; etaWarehouse: string | null; plannedDelivery: string | null },
): string {
  const told = [
    dates.etaPod && `ETA ${czDay(dates.etaPod)}`,
    dates.etaWarehouse && `ETA warehouse ${czDay(dates.etaWarehouse)}`,
    dates.plannedDelivery && `delivery ${czDay(dates.plannedDelivery)}`,
  ].filter(Boolean);
  return [`${NOTICE_KINDS[kind]} for job ${jobNumber}`, toldTo && `to ${toldTo}`, told.join(", ")].filter(Boolean).join(" · ");
}

/** The note type in the Communication log for how they were told. */
export const noteTypeOf = (channel: NoticeChannel): "Email" | "Call" | "Note" => (channel === "email" ? "Email" : channel === "phone" ? "Call" : "Note");
