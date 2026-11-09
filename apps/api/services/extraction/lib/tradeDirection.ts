import { placeCodeOf, resolveCountryCode } from "../../../lib/geo/format";

// Operations are run from the Czech Republic, so what is read from a document is an import when
// the cargo ends up there and an export when it ends up anywhere else, whatever the document calls it.
const HOME_COUNTRY = "CZ";

/** Where a shipment's cargo ends up, by the labels of its reading: the first one read decides. */
export const SHIPMENT_DESTINATION_LABELS = ["Destination", "POD"] as const;

/** As above for a customer's request, whose Destination stops at the port when one is named. */
export const QUOTE_DESTINATION_LABELS = ["Delivery", "Destination"] as const;

// The country of "Hamburg (DEHAM)", "Halifax, Canada" or "Street 1, 110 00 Praha, CZ"; null when it doesn't say.
function countryOfPlace(text: string): string | null {
  const code = placeCodeOf(text);
  if (code) return code.slice(0, 2);
  return resolveCountryCode(text.split(/[,;/]/).pop() ?? "");
}

/**
 * Sets the Trade Direction of a reading, its places already in the database's form, from where its
 * cargo ends up. Any of the places in the Czech Republic makes it an import: cargo discharged at
 * Praha is an import even when it goes on to Linz. Otherwise the first place read decides; when its
 * country can't be told, the reader's own answer stays. A port of discharge abroad, with no
 * destination read, may be only where the cargo comes off on its way to the Czech Republic: the
 * direction is left unset. The record is changed in place.
 */
export function applyTradeDirection(record: Record<string, string>, destinationLabels: readonly string[] = SHIPMENT_DESTINATION_LABELS): void {
  const read = destinationLabels.filter((l) => record[l]?.trim());
  if (read.some((l) => countryOfPlace(record[l]!) === HOME_COUNTRY)) {
    record["Trade Direction"] = "Import";
    return;
  }
  const country = read[0] ? countryOfPlace(record[read[0]]!) : null;
  if (!country) return;
  if (read[0] === "POD") delete record["Trade Direction"];
  else record["Trade Direction"] = "Export";
}
