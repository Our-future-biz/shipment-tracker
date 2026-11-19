// A Load Type as the screens name it (web lib/enums loadTypeLabel): by air a Full Load is called a
// Single Shipment, though it is stored as "Full Load". The server's messages name it the same way, so
// an air job is not called "Full Load" in a refusal while its page says "Single Shipment".

const FULL_LOAD = "Full Load";
const SINGLE_SHIPMENT = "Single Shipment";

/** A load type as shown: "Single Shipment" for an Air Freight Full Load, otherwise as stored (trimmed). */
export function loadTypeLabel(loadType: string | null | undefined, freightMode: string | null | undefined): string {
  const own = (loadType ?? "").trim();
  return own.toLowerCase() === FULL_LOAD.toLowerCase() && /^\s*air/i.test(freightMode ?? "") ? SINGLE_SHIPMENT : own;
}
