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
