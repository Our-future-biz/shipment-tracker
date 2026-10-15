import type { PriceSnapshot } from "../interfaces/interfaces";

// What Trucking owes the other services, as outbox payloads: the dates and plate written to the
// job (ShipmentUpdate fields), and the lines it keeps in the job's Costs Breakdown. Pure.

/** The sourceRef of a consignment's selling lines / a trip's buying lines in Costs Breakdown. */
export const consignmentSourceRef = (consignmentId: string) => `trucking:consignment:${consignmentId}`;
export const tripSourceRef = (tripId: string) => `trucking:trip:${tripId}`;

/** A cost line as invoicing takes it (_internalInvoicingTruckingLines). */
export interface CostLinePush {
  chargeCode: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  currency: string;
  vendor: string;
  haulierId: string | null;
  /** Buying lines known for real at once (the internal line): the real amount per unit and the document number */
  realAmount?: number;
  invoiceNumber?: string;
}

/** The payload of a "costs" outbox row: the whole set of one sourceRef (empty lists remove it). */
export interface CostsPayload {
  sourceRef: string;
  buying: CostLinePush[];
  selling: CostLinePush[];
}

// Every price line is road freight; the line's label ("Fuel surcharge 12 %") tells them apart.
const lines = (ref: string, price: PriceSnapshot, vendor: { name: string; id: string } | null): CostLinePush[] =>
  price.lines.map((l) => ({
    chargeCode: "road_freight",
    description: `${ref} · ${l.label}`,
    qty: l.qty,
    unit: l.unit,
    unitPrice: l.unitPrice,
    amount: l.amount,
    currency: price.currency,
    vendor: vendor?.name ?? "",
    haulierId: vendor?.id ?? null,
  }));

/** What the customer pays for a consignment (selling side); none when it has no price. */
export function sellCosts(consignment: { id: string; ref: string; sell: PriceSnapshot | null }): CostsPayload {
  return { sourceRef: consignmentSourceRef(consignment.id), buying: [], selling: consignment.sell ? lines(consignment.ref, consignment.sell, null) : [] };
}

/** What the haulier is paid for a trip (buying side, estimate); none when it has no price. */
export function buyCosts(trip: { id: string; ref: string; buy: PriceSnapshot | null; haulierCustomerId: string; haulierName: string }): CostsPayload {
  const vendor = { name: trip.haulierName, id: trip.haulierCustomerId };
  return { sourceRef: tripSourceRef(trip.id), buying: trip.buy ? lines(trip.ref, trip.buy, vendor) : [], selling: [] };
}

/** Removes a consignment's / a trip's lines. */
export const noCosts = (sourceRef: string): CostsPayload => ({ sourceRef, buying: [], selling: [] });

/** A trip planned: the job's pick-up date, planned delivery date and plate (each only when known). */
export function plannedUpdate(p: { pickupDate: string; promisedDate: string | null; tractorPlate: string }): Record<string, string> {
  const out: Record<string, string> = { pickupDate: p.pickupDate };
  if (p.promisedDate) out.plannedDeliveryDate = p.promisedDate;
  if (p.tractorPlate) out.plateNumber = p.tractorPlate;
  return out;
}

// ---- Phase 5: LTL trips and partner deliveries -------------------------------------------------

/** The buying lines of one job's share of an LTL trip / of a partner's delivery leg. */
export const tripJobSourceRef = (tripId: string, shipmentId: string) => `trucking:trip:${tripId}:job:${shipmentId}`;
export const legSourceRef = (legId: string) => `trucking:leg:${legId}`;

const RUN_TEXT: Record<"PICKUP_RUN" | "LINEHAUL" | "DELIVERY_RUN", string> = {
  PICKUP_RUN: "pick-up run",
  LINEHAUL: "line haul",
  DELIVERY_RUN: "delivery run",
};

/**
 * One job's share of an LTL trip: one buying line in CZK, "LCZ2026000007 pick-up run share (3 of
 * 18 consignments)"; none when the trip has no price.
 */
export function tripJobCosts(
  trip: { id: string; ref: string; kind: "PICKUP_RUN" | "LINEHAUL" | "DELIVERY_RUN"; haulierCustomerId: string; haulierName: string; priced: boolean },
  job: { shipmentId: string; consignments: number; shareCzk: number },
  tripConsignments: number,
): CostsPayload {
  const sourceRef = tripJobSourceRef(trip.id, job.shipmentId);
  if (!trip.priced) return noCosts(sourceRef);
  const line: CostLinePush = {
    chargeCode: "road_freight",
    description: `${trip.ref} ${RUN_TEXT[trip.kind]} share (${job.consignments} of ${tripConsignments} consignment${tripConsignments === 1 ? "" : "s"})`,
    qty: 1,
    unit: "trip",
    unitPrice: job.shareCzk,
    amount: job.shareCzk,
    currency: "CZK",
    vendor: trip.haulierName,
    haulierId: trip.haulierCustomerId,
  };
  return { sourceRef, buying: [line], selling: [] };
}

/** A partner's delivery of a consignment (buying side); none when it has no price. */
export function partnerLegCosts(leg: { id: string; buy: PriceSnapshot | null }, consignmentRef: string, partner: { id: string; name: string }): CostsPayload {
  return { sourceRef: legSourceRef(leg.id), buying: leg.buy ? lines(`${consignmentRef} partner delivery`, leg.buy, partner) : [], selling: [] };
}

// ---- Phase 6: internal billing and delivery exceptions -------------------------------------------

/** The one internal buying line of a consignment billed to another department / a charged exception's selling line. */
export const internalSourceRef = (consignmentId: string) => `trucking:internal:${consignmentId}`;
export const exceptionSourceRef = (exceptionId: string) => `trucking:exception:${exceptionId}`;

/** The vendor of the internal line in the job's Costs. */
export const INTERNAL_VENDOR = "Trucking (internal)";

/**
 * What the job pays Trucking for an internal consignment: one buying line in CZK, the estimate and
 * the real cost both the charge (Trucking prices it itself), with the internal statement number(s)
 * once the month is closed; none when nothing is charged (no rows yet).
 */
export function internalCosts(c: { id: string; ref: string }, charged: { amount: number; statementNumbers: string[] } | null): CostsPayload {
  const sourceRef = internalSourceRef(c.id);
  if (!charged) return noCosts(sourceRef);
  const line: CostLinePush = {
    chargeCode: "road_freight",
    description: `${c.ref} · Internal road freight (Trucking)`,
    qty: 1,
    unit: "consignment",
    unitPrice: charged.amount,
    amount: charged.amount,
    currency: "CZK",
    vendor: INTERNAL_VENDOR,
    haulierId: null,
    realAmount: charged.amount,
    invoiceNumber: charged.statementNumbers.join(", "),
  };
  return { sourceRef, buying: [line], selling: [] };
}

/** A delivery exception charged to the customer: one selling line, "TCZ… · Waiting time 45 min". */
export function exceptionCosts(e: { id: string }, consignmentRef: string, text: string, amount: number, currency: "CZK" | "EUR"): CostsPayload {
  const line: CostLinePush = {
    chargeCode: "road_freight",
    description: `${consignmentRef} · ${text}`,
    qty: 1,
    unit: "",
    unitPrice: amount,
    amount,
    currency,
    vendor: "",
    haulierId: null,
  };
  return { sourceRef: exceptionSourceRef(e.id), buying: [], selling: [line] };
}
