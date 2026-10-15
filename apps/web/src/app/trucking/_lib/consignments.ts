import type {
  ConsignmentDetail,
  ConsignmentListItem,
  ConsignmentStatus,
  ConsignmentView,
  StampKind,
  TripDetail,
  TripStatus,
} from "@/hooks/useTruckingConsignments";
import type { Tone } from "@/app/warehouse/gate-log/_lib/gate";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { formatMoney, formatPercent } from "./tariffs";

// Pure helpers of the consignment and trip screens: status words and colours, the lifecycle, what
// needs attention, and which actions a consignment allows now (and why not). Tested in
// consignments.test.ts.

export interface StatusChip {
  label: string;
  tone: Tone;
  hint: string;
}

export const CONSIGNMENT_STATUS_CHIP: Record<ConsignmentStatus, StatusChip> = {
  BOOKED: { label: "Booked", tone: "", hint: "Waiting for a trip and a haulier" },
  PLANNED: { label: "Planned", tone: "b", hint: "On a trip with a haulier; the transport order is not sent yet" },
  ORDERED: { label: "Ordered", tone: "a", hint: "Transport order sent; waiting for the haulier to confirm" },
  CONFIRMED: { label: "Confirmed", tone: "i", hint: "The haulier confirmed the transport order" },
  PICKED_UP: { label: "Picked up", tone: "i", hint: "Loaded at the pick-up site, on its way" },
  DELIVERED: { label: "Delivered", tone: "b", hint: "Delivered; waiting for the proof of delivery (POD)" },
  POD_RECEIVED: { label: "POD received", tone: "g", hint: "The signed proof of delivery is in" },
  READY_TO_BILL: { label: "Ready to bill", tone: "g", hint: "Every consignment of the job has its POD; the job is in Billing" },
  CANCELLED: { label: "Cancelled", tone: "r", hint: "Cancelled by a manager, with a reason" },
};

export const TRIP_STATUS_CHIP: Record<TripStatus, StatusChip> = {
  DRAFT: { label: "Draft", tone: "", hint: "Haulier chosen; the transport order is not sent yet" },
  ORDERED: { label: "Ordered", tone: "a", hint: "Transport order sent; waiting for the haulier to confirm" },
  CONFIRMED: { label: "Confirmed", tone: "i", hint: "The haulier confirmed the transport order" },
  IN_TRANSIT: { label: "In transit", tone: "b", hint: "Picked up, not yet delivered" },
  DONE: { label: "Done", tone: "g", hint: "Delivered" },
  CANCELLED: { label: "Cancelled", tone: "r", hint: "Cancelled by a manager; its consignment went back to Booked" },
};

/** The main road of a consignment, in order; Cancelled is a side state shown apart. */
export const CONSIGNMENT_FLOW: Exclude<ConsignmentStatus, "CANCELLED">[] = [
  "BOOKED",
  "PLANNED",
  "ORDERED",
  "CONFIRMED",
  "PICKED_UP",
  "DELIVERED",
  "POD_RECEIVED",
  "READY_TO_BILL",
];

/** Position on the main road; Cancelled is -1. */
export const statusRank = (status: ConsignmentStatus): number => CONSIGNMENT_FLOW.indexOf(status as Exclude<ConsignmentStatus, "CANCELLED">);

export const STAMP_LABELS: Record<StampKind, string> = {
  confirmed: "Confirmed",
  pickedUp: "Picked up",
  delivered: "Delivered",
  podReceived: "POD received",
};

export const STAMP_KINDS: StampKind[] = ["confirmed", "pickedUp", "delivered", "podReceived"];

type Stamps = ConsignmentDetail["stamps"];

/** A stamp of a consignment, or null; the API may leave out a kind that was never stamped. */
export const stampOf = (stamps: Stamps, kind: StampKind) => stamps[kind] ?? null;

/** The lifecycle as the shared strip draws it (the Warehouse's LifecycleStrip): every step, done or not, with its time. */
export function consignmentLifecycle(
  c: Pick<ConsignmentDetail, "status" | "createdAt" | "stamps" | "tripId" | "podReceivedAt">,
  trip?: Pick<TripDetail, "transportOrder"> | null,
): interfaces.GatePositionLifecycle {
  const rank = statusRank(c.status);
  const order = trip?.transportOrder ?? null;
  const reachedAt: Record<(typeof CONSIGNMENT_FLOW)[number], string | null> = {
    BOOKED: c.createdAt,
    PLANNED: null,
    ORDERED: order?.sentAt ?? null,
    CONFIRMED: stampOf(c.stamps, "confirmed")?.at ?? order?.confirmedAt ?? null,
    PICKED_UP: stampOf(c.stamps, "pickedUp")?.at ?? null,
    DELIVERED: stampOf(c.stamps, "delivered")?.at ?? null,
    POD_RECEIVED: stampOf(c.stamps, "podReceived")?.at ?? c.podReceivedAt,
    READY_TO_BILL: null,
  };
  const steps = CONSIGNMENT_FLOW.map((stage, i) => {
    // A cancelled consignment keeps what it reached: its stamps, and a trip it still had.
    const done = rank >= 0 ? i <= rank : stage === "BOOKED" || (stage === "PLANNED" && !!c.tripId) || !!reachedAt[stage];
    return { stage, label: CONSIGNMENT_STATUS_CHIP[stage].label, at: done ? reachedAt[stage] : null, done };
  });
  return {
    stage: c.status,
    label: CONSIGNMENT_STATUS_CHIP[c.status].label,
    at: rank >= 0 ? reachedAt[CONSIGNMENT_FLOW[rank]!] : null,
    refused: false,
    steps,
  };
}

/** "Pick-up within 24 h and no trip +1": the first reason and how many more, or null. */
export function attentionSummary(reasons: readonly string[]): { first: string; more: number } | null {
  if (!reasons.length) return null;
  return { first: reasons[0]!, more: reasons.length - 1 };
}

/** Quick filters of the Consignments tab (?view=); the server counts and filters them. */
export const CONSIGNMENT_CHIPS: { id: ConsignmentView; label: string; hint: string; danger?: boolean }[] = [
  { id: "attention", label: "Needs attention", hint: "Something is late or missing: no trip close to the pick-up, no confirmation, no POD, a margin waiting for approval", danger: true },
  { id: "pickupToday", label: "Pick-up today", hint: "Planned to be picked up today (Prague)" },
  { id: "deliveryToday", label: "Delivery today", hint: "Promised for delivery today (Prague)" },
  { id: "podMissing", label: "POD missing", hint: "Delivered, but the proof of delivery is not in yet" },
  { id: "readyToBill", label: "Ready to bill", hint: "Every consignment of the job has its POD" },
];

/** The tiles over the Consignments grid: counts from the server, each opening its view. */
export const CONSIGNMENT_TILES: { id: "openFtlWithoutHaulier" | "pickupToday" | "deliveryToday"; label: string; hint: string; view: ConsignmentView | null; status: ConsignmentStatus | null }[] = [
  { id: "openFtlWithoutHaulier", label: "Open FTL without haulier", hint: "Booked FTL consignments not yet on a trip", view: null, status: "BOOKED" },
  { id: "pickupToday", label: "Pick-up today", hint: "Planned to be picked up today (Prague)", view: "pickupToday", status: null },
  { id: "deliveryToday", label: "Delivery today", hint: "Promised for delivery today (Prague)", view: "deliveryToday", status: null },
];

/** The margin as a line: "1 250 CZK · 12.5 %"; "—" when not known yet (no buy price). */
export function marginText(c: Pick<ConsignmentListItem, "marginCzk" | "marginPercent">): string {
  if (c.marginCzk == null) return "—";
  return c.marginPercent == null ? formatMoney(c.marginCzk, "CZK") : `${formatMoney(c.marginCzk, "CZK")} · ${formatPercent(c.marginPercent)}`;
}

/** Whether the margin stops the transport order: below the floor and not approved by a manager. */
export const marginBlocks = (c: Pick<ConsignmentListItem, "belowFloor" | "marginApproved">) => c.belowFloor && !c.marginApproved;

export const MARGIN_BLOCK_TEXT = "The margin is below the floor — a manager must approve it before the transport order goes out.";

/** Whether an action can be taken now; when not, the sentence that says why (for a tooltip). */
export interface ActionState {
  allowed: boolean;
  reason: string;
}

const yes: ActionState = { allowed: true, reason: "" };
const no = (reason: string): ActionState => ({ allowed: false, reason });

export interface ConsignmentActions {
  edit: ActionState;
  /** After the pick-up only notes and references change. */
  editLimited: boolean;
  planTrip: ActionState;
  printOrder: ActionState;
  sendOrder: ActionState;
  recordConfirmation: ActionState;
  pickedUp: ActionState;
  delivered: ActionState;
  podReceived: ActionState;
  cancel: ActionState;
  approveMargin: ActionState;
  voidStamp: boolean;
}

type ActionTrip = Pick<TripDetail, "status" | "haulierStatus" | "haulierIssues" | "transportOrder"> | null;

/** What a consignment allows now, by its status, trip, margin and the user's permissions (from the server). */
export function consignmentActions(c: Pick<ConsignmentDetail, "status" | "tripId" | "belowFloor" | "marginApproved" | "permissions">, trip: ActionTrip, hasPod: boolean): ConsignmentActions {
  const rank = statusRank(c.status);
  const cancelled = c.status === "CANCELLED";
  const pickedUp = rank >= statusRank("PICKED_UP");
  const blockedHaulier = trip?.haulierStatus === "blocked";
  const liveTrip = !!trip && trip.status !== "CANCELLED";

  const orderState = (): ActionState => {
    if (cancelled) return no("The consignment is cancelled");
    if (!c.tripId || !liveTrip) return no("Plan the trip first");
    if (rank >= statusRank("DELIVERED")) return no("Already delivered");
    if (marginBlocks(c)) return no(MARGIN_BLOCK_TEXT);
    if (blockedHaulier) return no(`The haulier is blocked: ${trip.haulierIssues.filter((i) => i.severity === "block").map((i) => i.message).join("; ") || "see its page"}`);
    return yes;
  };
  const order = orderState();

  let recordConfirmation = no("Send the transport order first");
  if (c.status === "ORDERED") recordConfirmation = yes;
  else if (rank >= statusRank("CONFIRMED")) recordConfirmation = no("Already confirmed");

  let pickedUpState = no("Send the transport order first");
  if (c.status === "ORDERED" || c.status === "CONFIRMED") pickedUpState = yes;
  else if (pickedUp) pickedUpState = no("Already stamped");

  let delivered = no("Stamp Picked up first");
  if (c.status === "PICKED_UP") delivered = yes;
  else if (rank >= statusRank("DELIVERED")) delivered = no("Already stamped");

  let podReceived = no("Stamp Delivered first");
  if (c.status === "DELIVERED") podReceived = hasPod || c.permissions.canVoidStamp ? yes : no("Upload the POD first (a manager may stamp it without one)");
  else if (rank >= statusRank("POD_RECEIVED")) podReceived = no("Already stamped");

  let cancel = yes;
  if (!c.permissions.canCancel) cancel = no("Only a manager can cancel a consignment");
  else if (cancelled) cancel = no("Already cancelled");
  else if (pickedUp) cancel = no("Picked up — it can no longer be cancelled");

  let approveMargin = yes;
  if (!c.belowFloor) approveMargin = no("The margin is above the floor; nothing to approve");
  else if (c.marginApproved) approveMargin = no("Already approved");
  else if (!c.permissions.canApproveMargin) approveMargin = no("Only a manager can approve a margin below the floor");

  return {
    edit: cancelled ? no("The consignment is cancelled") : c.status === "READY_TO_BILL" ? no("Ready to bill — the job is in Billing") : yes,
    editLimited: pickedUp,
    planTrip: cancelled ? no("The consignment is cancelled") : c.status !== "BOOKED" || (c.tripId && liveTrip) ? no("Already on a trip") : yes,
    printOrder: order,
    sendOrder: order.allowed && rank > statusRank("CONFIRMED") ? no("Already picked up") : order,
    recordConfirmation: cancelled ? no("The consignment is cancelled") : recordConfirmation,
    pickedUp: cancelled ? no("The consignment is cancelled") : pickedUpState,
    delivered: cancelled ? no("The consignment is cancelled") : delivered,
    podReceived: cancelled ? no("The consignment is cancelled") : podReceived,
    cancel,
    approveMargin,
    voidStamp: c.permissions.canVoidStamp && !cancelled,
  };
}

/** The next step of a consignment, as the one primary button of its page. */
export function nextStep(c: Pick<ConsignmentDetail, "status">): "planTrip" | "sendOrder" | "recordConfirmation" | "pickedUp" | "delivered" | "podReceived" | null {
  switch (c.status) {
    case "BOOKED":
      return "planTrip";
    case "PLANNED":
      return "sendOrder";
    case "ORDERED":
      return "recordConfirmation";
    case "CONFIRMED":
      return "pickedUp";
    case "PICKED_UP":
      return "delivered";
    case "DELIVERED":
      return "podReceived";
    default:
      return null;
  }
}

const STAMP_WINDOW_DAYS = 7;

/** Why a stamp time cannot be used (null = now is fine): not in the future, at most 7 days back. */
export function stampTimeProblem(at: string | null, now: Date = new Date()): string | null {
  if (at == null) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return "Not a valid time";
  if (t > now.getTime() + 60_000) return "The time cannot be in the future";
  if (t < now.getTime() - STAMP_WINDOW_DAYS * 86_400_000) return `At most ${STAMP_WINDOW_DAYS} days back`;
  return null;
}

/** "Picked up 15.10.2026 14:05 · Jana Nováková" for a stamp tag. */
export const stampText = (kind: StampKind, stamp: { at: string; by: string }) => `${STAMP_LABELS[kind]} ${formatDateTime(stamp.at)}${stamp.by ? ` · ${stamp.by}` : ""}`;

/** A route in one line: "110 00 Praha → 602 00 Brno". */
export function routeText(c: Pick<ConsignmentListItem, "pickupPostcode" | "pickupCity" | "deliveryPostcode" | "deliveryCity">, formatPsc: (psc: string) => string): string {
  const end = (psc: string, city: string) => [psc ? formatPsc(psc) : "", city].filter(Boolean).join(" ") || "—";
  return `${end(c.pickupPostcode, c.pickupCity)} → ${end(c.deliveryPostcode, c.deliveryCity)}`;
}

/** The consignment page of a ref's id. */
export const consignmentHref = (id: string) => `/trucking/consignments/${id}`;
export const tripHref = (id: string) => `/trucking/trips/${id}`;
