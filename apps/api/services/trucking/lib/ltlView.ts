import type { Leg, LegKind, LegStatus, PlanningLeg, TripLeg } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import { deadlineOf, neededBy, type LtlFacts } from "./ltlRules";
import { roundToStep } from "./rateEngine";

// Rows → API objects for LTL legs and their trips. Pure.

/** A leg as the API shows it (an FTL DIRECT leg is never shown). */
export const legItem = (l: TruckingLegRecord, tripRef: string | null): Leg => ({
  id: l.id,
  consignmentId: l.consignmentId,
  seq: l.seq,
  kind: l.kind as LegKind,
  fromText: l.fromText,
  toText: l.toText,
  tripId: l.tripId,
  tripRef: l.tripId ? tripRef : null,
  haulierCustomerId: l.haulierCustomerId,
  depotSiteId: l.depotSiteId,
  buy: l.buy,
  costShareCzk: l.costShareCzk,
  status: l.status as LegStatus,
});

const isLtlLeg = (l: TruckingLegRecord) => l.kind !== "DIRECT";

/** A consignment's LTL legs in road order. */
export const ltlLegsOf = (consignmentId: string, legs: TruckingLegRecord[]) =>
  legs.filter((l) => l.consignmentId === consignmentId && isLtlLeg(l)).sort((a, b) => a.seq - b.seq);

/** The facts an LTL consignment's status is worked out from: its stamps, gate times and legs. */
export function ltlFactsOf(c: TruckingConsignmentRecord, legs: TruckingLegRecord[], tripOf: Map<string, TruckingTripRecord>): LtlFacts {
  return {
    cancelledAt: c.cancelledAt,
    pickedUpAt: c.pickedUpAt,
    gateInAt: c.gateInAt,
    gateOutAt: c.gateOutAt,
    deliveredAt: c.deliveredAt,
    podReceivedAt: c.podReceivedAt,
    readyToBillAt: c.readyToBillAt,
    legs: ltlLegsOf(c.id, legs).map((l) => {
      const trip = l.tripId ? tripOf.get(l.tripId) : undefined;
      return { kind: l.kind as LegKind, status: l.status as LegStatus, orderSent: !!trip && !trip.cancelledAt && !!trip.orderSentAt };
    }),
  };
}

/**
 * What an LTL consignment costs us so far: its legs' shares of their trips and its partner's
 * delivery price (CZK); null when no leg is priced yet (the estimate from pricing then counts).
 */
export function ltlBuyCzk(consignmentId: string, legs: TruckingLegRecord[]): number | null {
  const priced = ltlLegsOf(consignmentId, legs)
    .map((l) => (l.tripId ? l.costShareCzk : (l.buy?.totalCzk ?? null)))
    .filter((x): x is number => x !== null);
  return priced.length ? roundToStep(priced.reduce((a, x) => a + x, 0), 0.01) : null;
}

/** Legs in the order of the trip's stops (legs missing from the order last, by consignment). */
export function inStopOrder<T extends { id: string }>(legs: T[], stopOrder: string[]): T[] {
  const at = (id: string) => {
    const i = stopOrder.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...legs].sort((a, b) => at(a.id) - at(b.id));
}

export function tripLeg(l: TruckingLegRecord, c: TruckingConsignmentRecord): TripLeg {
  return {
    legId: l.id,
    kind: l.kind as LegKind,
    status: l.status as LegStatus,
    consignmentId: c.id,
    consignmentRef: c.ref,
    jobNumber: c.jobNumber,
    shipmentId: c.shipmentId,
    customerName: c.customerName,
    fromText: l.fromText,
    toText: l.toText,
    fromPostcode: c.pickup.postcode,
    fromCity: c.pickup.city,
    toPostcode: c.delivery.postcode,
    toCity: c.delivery.city,
    pieces: c.load.pieces,
    palletPlaces: c.load.palletPlaces,
    ldm: c.load.ldm,
    weightKg: c.load.weightKg,
    chargeableKg: c.chargeableKg,
    adr: c.load.adr,
    tailLift: c.load.tailLift,
    promisedDate: c.promisedDate,
    costShareCzk: l.costShareCzk,
  };
}

export function planningLeg(l: TruckingLegRecord, c: TruckingConsignmentRecord, zoneLabel: string, today: string): PlanningLeg {
  const kind = l.kind as LegKind;
  return {
    legId: l.id,
    kind,
    status: l.status as LegStatus,
    seq: l.seq,
    consignmentId: c.id,
    consignmentRef: c.ref,
    jobNumber: c.jobNumber,
    customerName: c.customerName,
    fromText: l.fromText,
    toText: l.toText,
    fromPostcode: c.pickup.postcode,
    fromCity: c.pickup.city,
    toPostcode: c.delivery.postcode,
    toCity: c.delivery.city,
    zoneLabel,
    serviceLevel: c.serviceLevel,
    pieces: c.load.pieces,
    palletPlaces: c.load.palletPlaces,
    ldm: c.load.ldm,
    weightKg: c.load.weightKg,
    chargeableKg: c.chargeableKg,
    adr: c.load.adr,
    tailLift: c.load.tailLift,
    pickupDate: c.pickupDate,
    promisedDate: c.promisedDate,
    promisedFinal: c.promisedFinal,
    deadline: deadlineOf(neededBy(kind, c), today),
  };
}
