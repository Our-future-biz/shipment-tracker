import type { ShipmentItem } from "@/hooks/useShipments";

/** The Customs "received" ticks: the manual-override field and the document each one follows. */
export const RECEIVED_TICKS = {
  csRecvInvoice: "Invoice",
  csRecvPacking: "Packing list",
} as const;

export type ReceivedTickField = keyof typeof RECEIVED_TICKS;

export const isReceivedTick = (key: string): key is ReceivedTickField => key in RECEIVED_TICKS;

/** True while nobody set the tick by hand, so it follows the shipment's documents. */
export function receivedFollowsDocuments(shipment: ShipmentItem, field: ReceivedTickField): boolean {
  return !shipment[field];
}

/**
 * A tick follows the shipment's documents until someone sets it by hand;
 * the manual value then wins (csRecvVal in the mockup).
 */
export function receivedValue(shipment: ShipmentItem, field: ReceivedTickField): boolean {
  const manual = shipment[field] ?? "";
  if (manual === "yes") return true;
  if (manual === "no") return false;
  return (shipment.documentTypes ?? []).includes(RECEIVED_TICKS[field]);
}

/**
 * What to store when the tick is flipped. If the manual choice matches what the documents
 * say, the override is dropped and the tick follows the documents again (same as the mockup).
 */
export function toggledReceivedOverride(shipment: ShipmentItem, field: ReceivedTickField): string {
  const wanted = !receivedValue(shipment, field);
  const fromDocuments = (shipment.documentTypes ?? []).includes(RECEIVED_TICKS[field]);
  return wanted === fromDocuments ? "" : wanted ? "yes" : "no";
}
