import type {
  ConsignmentDetail,
  TripCapacity,
  TripFill,
  TripLeg,
  ConsignmentListItem,
  HaulierIssue,
  HaulierStatus,
  MarginFloor,
  StampKind,
  TransportOrderState,
  TripDetail,
  TripListItem,
  TruckingEventItem,
} from "../interfaces/interfaces";
import type { DeliveryException, WarehouseExceptionItem } from "../interfaces/avizace.interfaces";
import type { TruckingConsignmentRecord, TruckingHaulierLinkRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import { approvalCovers, attentionReasons, marginOf, type ConsignmentFacts } from "./consignmentRules";
import { legItem, ltlLegsOf } from "./ltlView";
import { haulierCostOf, type CostPart, type LegRealCost } from "./haulierCost";
import { avizaceNeeded } from "./avizaceRules";

// Rows → API objects for consignments and trips. Pure: the service passes the rows, the margin
// floor, the haulier's status and the day.

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The facts a consignment's status and stamp rules are worked out from. */
export const factsOf = (c: TruckingConsignmentRecord, trip: TruckingTripRecord | null): ConsignmentFacts => ({
  cancelledAt: c.cancelledAt,
  tripId: c.tripId,
  orderSentAt: trip && !trip.cancelledAt ? trip.orderSentAt : null,
  confirmedAt: c.confirmedAt,
  pickedUpAt: c.pickedUpAt,
  deliveredAt: c.deliveredAt,
  podReceivedAt: c.podReceivedAt,
  readyToBillAt: c.readyToBillAt,
});

/**
 * The parts of a consignment's buy: FTL its live trip's; LTL its legs' shares of their trips and
 * its partner's delivery price. `real`: the approved haulier invoice costs of its legs.
 */
export function costPartsOf(c: TruckingConsignmentRecord, trip: TruckingTripRecord | null, legs: TruckingLegRecord[], real: LegRealCost[]): CostPart[] {
  const realOf = (match: (r: LegRealCost) => boolean) => real.find((r) => r.consignmentId === c.id && match(r)) ?? null;
  if (c.scope === "LTL") {
    return ltlLegsOf(c.id, legs).map((l) => ({ estCzk: l.tripId ? l.costShareCzk : (l.buy?.totalCzk ?? null), real: realOf((r) => r.legId === l.id) }));
  }
  return trip && !trip.cancelledAt ? [{ estCzk: trip.buyCzk, real: realOf((r) => r.tripId === trip.id) }] : [];
}

/**
 * The margin of a consignment now, and whether an approval covers it. The buy is the one the
 * Reports use: real where an approved haulier invoice covers it, else the estimate (else the
 * estimate from pricing).
 */
export function moneyOf(c: TruckingConsignmentRecord, trip: TruckingTripRecord | null, floor: MarginFloor, legs: TruckingLegRecord[] = [], real: LegRealCost[] = []) {
  const buy = haulierCostOf(costPartsOf(c, trip, legs, real), c.estBuyCzk);
  const m = marginOf(c.sellCzk, buy.buyCzk, floor);
  const approved = m.belowFloor && approvalCovers(c.marginApproval, m.marginCzk);
  return { sellCzk: c.sellCzk, ...buy, ...m, marginApproved: approved };
}

/**
 * `trip`: an FTL consignment's trip; for LTL the trip of the leg under way (shown in the list).
 * `legs`: the LTL legs (any consignments'; this one's are picked). `openExceptions`: its
 * delivery exceptions not closed. `real`: approved haulier invoice costs of legs (any consignments').
 */
export function listItem(
  c: TruckingConsignmentRecord,
  trip: TruckingTripRecord | null,
  floor: MarginFloor,
  today: string,
  now: Date,
  legs: TruckingLegRecord[] = [],
  openExceptions = 0,
  real: LegRealCost[] = [],
): ConsignmentListItem {
  const money = moneyOf(c, trip, floor, legs, real);
  const liveTrip = trip && !trip.cancelledAt ? trip : null;
  return {
    id: c.id,
    ref: c.ref,
    shipmentId: c.shipmentId,
    jobNumber: c.jobNumber,
    customerId: c.customerId,
    customerName: c.customerName,
    scope: c.scope,
    serviceLevel: c.serviceLevel,
    status: c.status,
    pickupDate: c.pickupDate,
    pickupPostcode: c.pickup.postcode,
    pickupCity: c.pickup.city,
    deliveryPostcode: c.delivery.postcode,
    deliveryCity: c.delivery.city,
    promisedDate: c.promisedDate,
    palletPlaces: c.load.palletPlaces,
    ldm: c.load.ldm,
    weightKg: c.load.weightKg,
    chargeableKg: c.chargeableKg,
    adr: c.load.adr,
    tripId: liveTrip?.id ?? null,
    tripRef: liveTrip?.ref ?? null,
    haulierName: liveTrip?.haulierName ?? null,
    sellCzk: money.sellCzk,
    buyCzk: money.buyCzk,
    buyReal: money.buyReal,
    buyInvoiceNumbers: money.buyInvoiceNumbers,
    marginCzk: money.marginCzk,
    marginPercent: money.marginPercent,
    belowFloor: money.belowFloor,
    marginApproved: money.marginApproved,
    podReceivedAt: iso(c.podReceivedAt),
    needsAttention: attentionReasons(
      {
        ...factsOf(c, trip),
        status: c.status,
        pickupDate: c.pickupDate,
        promisedDate: c.promisedDate,
        belowFloor: money.belowFloor,
        marginApproved: money.marginApproved,
        marginCzk: money.marginCzk,
        tripRejectedAt: liveTrip?.rejectedAt ?? null,
      },
      today,
      now,
    ),
    createdAt: c.createdAt.toISOString(),
    avizaceNeeded: avizaceNeeded(c),
    avizaceDone: !!c.avizace,
    openExceptions,
    internal: c.internal,
    pickedUpAt: iso(c.pickedUpAt),
    deliveredAt: iso(c.deliveredAt),
    tractorPlate: liveTrip?.tractorPlate ?? "",
    trailerPlate: liveTrip?.trailerPlate ?? "",
    driverName: liveTrip?.driverName ?? "",
    driverPhone: liveTrip?.driverPhone ?? "",
  };
}

export const eventItem = (e: { id: string; kind: string; at: Date; byName: string; payload: { summary?: string } }): TruckingEventItem => ({
  id: e.id,
  kind: e.kind,
  at: e.at.toISOString(),
  by: e.byName,
  summary: e.payload.summary ?? e.kind.replace(/_/g, " "),
});

const stamp = (at: Date | null, by: string | null) => (at ? { at: at.toISOString(), by: by ?? "" } : null);

export function detail(
  c: TruckingConsignmentRecord,
  trip: TruckingTripRecord | null,
  floor: MarginFloor,
  events: TruckingEventItem[],
  manager: boolean,
  today: string,
  now: Date,
  legs: TruckingLegRecord[] = [],
  tripRefs: Map<string, string> = new Map(),
  exceptions: DeliveryException[] = [],
  warehouseExceptions: WarehouseExceptionItem[] = [],
  real: LegRealCost[] = [],
): ConsignmentDetail {
  const item = listItem(c, trip, floor, today, now, legs, exceptions.filter((e) => !e.closedAt).length, real);
  const stamps: Record<StampKind, { at: string; by: string } | null> = {
    confirmed: stamp(c.confirmedAt, c.confirmedBy),
    pickedUp: stamp(c.pickedUpAt, c.pickedUpBy),
    delivered: stamp(c.deliveredAt, c.deliveredBy),
    podReceived: stamp(c.podReceivedAt, c.podReceivedBy),
  };
  const ltl = c.scope === "LTL";
  return {
    ...item,
    selfDelivered: c.selfDelivered,
    lastMile: ltl ? c.lastMile : null,
    partnerHaulierCustomerId: c.partnerHaulierCustomerId,
    legs: ltl ? ltlLegsOf(c.id, legs).map((l) => legItem(l, l.tripId ? (tripRefs.get(l.tripId) ?? null) : null)) : [],
    gateInAt: iso(c.gateInAt),
    promisedFinal: ltl ? c.promisedFinal : c.promisedDate !== null,
    pickup: c.pickup,
    delivery: c.delivery,
    load: c.load,
    // An internal consignment is not sold to the customer here: its price is the internal charge.
    sell: c.internal ? null : c.sell,
    quoteNumber: c.quoteNumber,
    stamps,
    marginApproval: c.marginApproval
      ? { byName: c.marginApproval.byName, at: c.marginApproval.at, reason: c.marginApproval.reason, marginCzk: c.marginApproval.marginCzk ?? 0 }
      : null,
    version: c.version,
    events,
    permissions: {
      canCancel: manager && !c.cancelledAt && !c.pickedUpAt && !c.gateInAt,
      canApproveMargin: manager && !c.cancelledAt && item.belowFloor && !item.marginApproved,
      canVoidStamp: manager && !c.cancelledAt,
    },
    avizace: c.avizace,
    exceptions,
    warehouseExceptions,
  };
}

export function transportOrderState(t: TruckingTripRecord, link: TruckingHaulierLinkRecord | null): TransportOrderState | null {
  if (!t.orderSentAt && !t.pinPrinted) return null;
  return {
    number: t.ref,
    sentAt: iso(t.orderSentAt),
    sentBy: t.orderSentBy,
    recordedOnly: t.orderRecordedOnly,
    confirmedAt: iso(t.confirmedAt),
    confirmedVia: t.confirmedVia,
    rejectedAt: iso(t.rejectedAt),
    rejectReason: t.rejectReason,
    pinPrinted: t.pinPrinted,
    podLinkExpiresAt: link ? link.expiresAt.toISOString() : null,
  };
}

export interface HaulierAssessment {
  status: HaulierStatus;
  issues: HaulierIssue[];
}

export function tripListItem(
  t: TruckingTripRecord,
  consignments: { id: string; ref: string }[],
  haulier: HaulierAssessment,
  link: TruckingHaulierLinkRecord | null,
  load: Pick<TripLoadView, "fill" | "warnings">,
): TripListItem {
  return {
    id: t.id,
    ref: t.ref,
    kind: t.kind,
    status: t.status,
    haulierCustomerId: t.haulierCustomerId,
    haulierName: t.haulierName,
    haulierStatus: haulier.status,
    haulierIssues: haulier.issues,
    vehicleTypeCode: t.vehicleTypeCode,
    tractorPlate: t.tractorPlate,
    trailerPlate: t.trailerPlate,
    driverName: t.driverName,
    driverPhone: t.driverPhone,
    plannedPickupDate: t.plannedPickupDate,
    consignmentIds: consignments.map((c) => c.id),
    buy: t.buy,
    transportOrder: transportOrderState(t, link),
    version: t.version,
    consignmentRefs: consignments.map((c) => c.ref),
    fill: load.fill,
    warnings: load.warnings,
  };
}

/** What a trip carries: its legs in stop order (LTL), the vehicle's capacity, the fill and the warnings. */
export interface TripLoadView {
  legs: TripLeg[];
  capacity: TripCapacity | null;
  fill: TripFill;
  warnings: string[];
}

const stampOf = (at: Date | null, by: string | null) => (at ? { at: at.toISOString(), by: by ?? "" } : null);

export function tripDetail(
  t: TruckingTripRecord,
  consignments: { id: string; ref: string }[],
  haulier: HaulierAssessment,
  link: TruckingHaulierLinkRecord | null,
  events: TruckingEventItem[],
  load: TripLoadView,
): TripDetail {
  const { consignmentRefs: _refs, ...item } = tripListItem(t, consignments, haulier, link, load);
  void _refs;
  return {
    ...item,
    buyCandidates: t.buyCandidates,
    events,
    legs: load.legs,
    stopOrder: t.kind === "FTL" ? [] : load.legs.map((l) => l.legId),
    capacity: load.capacity,
    fill: load.fill,
    warnings: load.warnings,
    stamps: { departed: stampOf(t.departedAt, t.departedBy), arrived: stampOf(t.arrivedAt, t.arrivedBy) },
  };
}
