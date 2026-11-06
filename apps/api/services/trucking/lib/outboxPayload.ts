import type { TruckingOutboxKind } from "../schemas/truckingOutbox.schema";
import type { CostsPayload } from "./truckingLinks";
import type { RealCostsPayload } from "./haulierInvoiceReal";
import type { CancelExpectedInput, ExpectArrivalInput, ExpectDepartureInput } from "./warehouseLink";

// What a trucking_outbox row carries, by its kind. Rows are written through `owed` (typed by the
// kind) and read back through parseOutboxRow, which checks the stored JSON still has the shape its
// kind needs before it is sent anywhere.

/** Exactly the ShipmentUpdate fields to send (planned / plate / delivered). */
export type ShipmentFields = Record<string, string>;

/** The POD on file when the job's POD was stamped; the bytes are read from the bucket when sent. */
export interface PodPayload {
  fileName: string;
  contentType: string;
  sha256: string;
  storageKey: string;
  stampedAt: string;
}

/** A delivery advice given, in words for the job's timeline. */
export interface DeliveryAdvicePayload {
  at: string;
  text: string;
}

/** A stamp of a road job's timeline. */
export interface StampPayload {
  stamp: "confirmed" | "pickedUp";
  at: string;
  /** The stamp was voided: its fact leaves the job's timeline. */
  voided?: boolean;
}

export interface TruckingOutboxPayloads {
  planned: ShipmentFields;
  plate: ShipmentFields;
  delivered: ShipmentFields;
  billing: Record<string, never>;
  costs: CostsPayload;
  expect_arrival: ExpectArrivalInput;
  expect_departure: ExpectDepartureInput;
  cancel_expected: CancelExpectedInput;
  real_costs: RealCostsPayload;
  pod: PodPayload;
  delivery_advice: DeliveryAdvicePayload;
  stamp: StampPayload;
}

export type TruckingOutboxPayload = TruckingOutboxPayloads[TruckingOutboxKind];

/** A row's kind with the payload that kind carries. */
export type TruckingOutboxMessage = { [K in TruckingOutboxKind]: { kind: K; payload: TruckingOutboxPayloads[K] } }[TruckingOutboxKind];

const isString = (v: unknown): v is string => typeof v === "string";

const isShipmentFields = (p: TruckingOutboxPayload): p is ShipmentFields => Object.values(p).every(isString);
const isCosts = (p: TruckingOutboxPayload): p is CostsPayload =>
  "sourceRef" in p && isString(p.sourceRef) && "buying" in p && Array.isArray(p.buying) && "selling" in p && Array.isArray(p.selling);
const isPod = (p: TruckingOutboxPayload): p is PodPayload =>
  "storageKey" in p && isString(p.storageKey) && "sha256" in p && isString(p.sha256) && "fileName" in p && isString(p.fileName) && "stampedAt" in p && isString(p.stampedAt);
const isDeliveryAdvice = (p: TruckingOutboxPayload): p is DeliveryAdvicePayload => "at" in p && isString(p.at) && "text" in p && isString(p.text);
const isStamp = (p: TruckingOutboxPayload): p is StampPayload => "stamp" in p && (p.stamp === "confirmed" || p.stamp === "pickedUp") && "at" in p && isString(p.at);
const isRealCosts = (p: TruckingOutboxPayload): p is RealCostsPayload => "sourceRef" in p && isString(p.sourceRef) && "realLines" in p && Array.isArray(p.realLines);
const isCancelExpected = (p: TruckingOutboxPayload): p is CancelExpectedInput => "shipmentId" in p && isString(p.shipmentId) && "tripRef" in p && isString(p.tripRef);
const isExpectDeparture = (p: TruckingOutboxPayload): p is ExpectDepartureInput => isCancelExpected(p) && "expectedAt" in p && isString(p.expectedAt);
const isExpectArrival = (p: TruckingOutboxPayload): p is ExpectArrivalInput => isExpectDeparture(p) && "pieces" in p && typeof p.pieces === "number";

/** The row's payload as its kind's type; throws when the stored JSON does not fit the kind. */
export function parseOutboxRow(row: { id: string; kind: TruckingOutboxKind; payload: TruckingOutboxPayload }): TruckingOutboxMessage {
  const p = row.payload;
  const fits = (() => {
    if (typeof p !== "object" || p === null) return null;
    switch (row.kind) {
      case "planned":
      case "plate":
      case "delivered":
        return isShipmentFields(p) ? { kind: row.kind, payload: p } : null;
      case "billing":
        return { kind: row.kind, payload: {} };
      case "costs":
        return isCosts(p) ? { kind: row.kind, payload: p } : null;
      case "real_costs":
        return isRealCosts(p) ? { kind: row.kind, payload: p } : null;
      case "pod":
        return isPod(p) ? { kind: row.kind, payload: p } : null;
      case "delivery_advice":
        return isDeliveryAdvice(p) ? { kind: row.kind, payload: p } : null;
      case "stamp":
        return isStamp(p) ? { kind: row.kind, payload: p } : null;
      case "expect_arrival":
        return isExpectArrival(p) ? { kind: row.kind, payload: p } : null;
      case "expect_departure":
        return isExpectDeparture(p) ? { kind: row.kind, payload: p } : null;
      case "cancel_expected":
        return isCancelExpected(p) ? { kind: row.kind, payload: p } : null;
    }
  })();
  if (!fits) throw new Error(`trucking outbox row ${row.id}: the payload does not fit kind ${row.kind}`);
  return fits;
}
