import type {
  ConsignmentDetail,
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
import type { TruckingConsignmentRecord, TruckingHaulierLinkRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import { approvalCovers, attentionReasons, marginOf, type ConsignmentFacts } from "./consignmentRules";

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

/** The buy price a consignment's margin is judged with: its trip's, else the estimate from pricing. */
export const buyCzkOf = (c: TruckingConsignmentRecord, trip: TruckingTripRecord | null): number | null =>
  trip && !trip.cancelledAt && trip.buyCzk !== null ? trip.buyCzk : c.estBuyCzk;

/** The margin of a consignment now, and whether an approval covers it. */
export function moneyOf(c: TruckingConsignmentRecord, trip: TruckingTripRecord | null, floor: MarginFloor) {
  const buyCzk = buyCzkOf(c, trip);
  const m = marginOf(c.sellCzk, buyCzk, floor);
  const approved = m.belowFloor && approvalCovers(c.marginApproval, m.marginCzk);
  return { sellCzk: c.sellCzk, buyCzk, ...m, marginApproved: approved };
}

export function listItem(c: TruckingConsignmentRecord, trip: TruckingTripRecord | null, floor: MarginFloor, today: string, now: Date): ConsignmentListItem {
  const money = moneyOf(c, trip, floor);
  const liveTrip = trip && !trip.cancelledAt ? trip : null;
  return {
    id: c.id,
    ref: c.ref,
    shipmentId: c.shipmentId,
    jobNumber: c.jobNumber,
    customerId: c.customerId,
    customerName: c.customerName,
    scope: "FTL",
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
): ConsignmentDetail {
  const item = listItem(c, trip, floor, today, now);
  const stamps: Record<StampKind, { at: string; by: string } | null> = {
    confirmed: stamp(c.confirmedAt, c.confirmedBy),
    pickedUp: stamp(c.pickedUpAt, c.pickedUpBy),
    delivered: stamp(c.deliveredAt, c.deliveredBy),
    podReceived: stamp(c.podReceivedAt, c.podReceivedBy),
  };
  return {
    ...item,
    pickup: c.pickup,
    delivery: c.delivery,
    load: c.load,
    sell: c.sell,
    quoteNumber: c.quoteNumber,
    stamps,
    marginApproval: c.marginApproval
      ? { byName: c.marginApproval.byName, at: c.marginApproval.at, reason: c.marginApproval.reason, marginCzk: c.marginApproval.marginCzk ?? 0 }
      : null,
    version: c.version,
    events,
    permissions: {
      canCancel: manager && !c.cancelledAt && !c.pickedUpAt,
      canApproveMargin: manager && !c.cancelledAt && item.belowFloor && !item.marginApproved,
      canVoidStamp: manager && !c.cancelledAt,
    },
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

export function tripListItem(t: TruckingTripRecord, consignments: { id: string; ref: string }[], haulier: HaulierAssessment, link: TruckingHaulierLinkRecord | null): TripListItem {
  return {
    id: t.id,
    ref: t.ref,
    kind: "FTL",
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
  };
}

export function tripDetail(
  t: TruckingTripRecord,
  consignments: { id: string; ref: string }[],
  haulier: HaulierAssessment,
  link: TruckingHaulierLinkRecord | null,
  events: TruckingEventItem[],
): TripDetail {
  const { consignmentRefs: _refs, ...item } = tripListItem(t, consignments, haulier, link);
  void _refs;
  return { ...item, buyCandidates: t.buyCandidates, events };
}
