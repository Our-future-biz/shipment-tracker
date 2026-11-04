import { APIError } from "encore.dev/api";
import { hasAllSizes } from "../../../lib/cargoVolume";
import { isUuid } from "../../../lib/uuid";
import type { AdrPackingGroup, CargoDimensionLine, PalletType } from "../interfaces/interfaces";

// Rules for the road-freight fields of a shipment: the structured pick-up / delivery place and
// the pallet / ADR details of its cargo lines - and the volume typed for a piece of a cargo line.
// Applied on every write, so a value is stored in one form whichever screen or caller sent it; a
// value that cannot be read is refused.

export const PALLET_TYPES: readonly PalletType[] = ["EUR", "INDUSTRIAL", "HALF", "QUARTER", "OTHER"];
export const ADR_PACKING_GROUPS: readonly AdrPackingGroup[] = ["I", "II", "III"];

const blank = (v: string | null | undefined): boolean => !(v ?? "").trim();

/** ISO 3166 alpha-2 in capitals ("cz" → "CZ"); null when blank. */
export function normalizeCountry(value: string | null | undefined, label: string): string | null {
  if (blank(value)) return null;
  const country = value!.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw APIError.invalidArgument(`${label} country must be a two-letter code (e.g. CZ)`);
  return country;
}

/**
 * A postcode as stored; null when blank. A Czech postcode is its five digits ("110 00" →
 * "11000"); any other is kept as typed, trimmed, in capitals, single-spaced.
 */
export function normalizePostcode(value: string | null | undefined, country: string | null, label: string): string | null {
  if (blank(value)) return null;
  const postcode = value!.trim().toUpperCase().replace(/\s+/g, " ");
  if (country !== "CZ") return postcode;
  const digits = postcode.replace(/\s/g, "");
  if (!/^\d{5}$/.test(digits)) throw APIError.invalidArgument(`${label} postcode must be 5 digits for CZ (e.g. 110 00)`);
  return digits;
}

/** A Customer Database site id; null when blank. */
export function normalizeSiteId(value: string | null | undefined, label: string): string | null {
  if (blank(value)) return null;
  const id = value!.trim();
  if (!isUuid(id)) throw APIError.invalidArgument(`${label} site is not a valid id`);
  return id;
}

type StopKey =
  | "pickupSiteId" | "pickupPostcode" | "pickupCountry"
  | "deliverySiteId" | "deliveryPostcode" | "deliveryCountry";
export type StopFields = Partial<Record<StopKey, string | null>>;

const STOPS = [
  { label: "Pick-up", siteId: "pickupSiteId", postcode: "pickupPostcode", country: "pickupCountry" },
  { label: "Delivery", siteId: "deliverySiteId", postcode: "deliveryPostcode", country: "deliveryCountry" },
] as const;

/**
 * The pick-up / delivery fields of a write, normalised. Only fields the write carries are
 * returned - except the postcode, which depends on the country: when either of the two is sent,
 * both are returned, the one not sent taken from `existing` (the stored shipment, on update).
 */
export function normalizeStops(data: StopFields, existing?: StopFields): StopFields {
  const out: StopFields = {};
  for (const stop of STOPS) {
    if (stop.siteId in data) out[stop.siteId] = normalizeSiteId(data[stop.siteId], stop.label);
    if (!(stop.postcode in data) && !(stop.country in data)) continue;
    const country = normalizeCountry(stop.country in data ? data[stop.country] : existing?.[stop.country], stop.label);
    out[stop.country] = country;
    out[stop.postcode] = normalizePostcode(stop.postcode in data ? data[stop.postcode] : existing?.[stop.postcode], country, stop.label);
  }
  return out;
}

/** The most m³ one piece is typed as: more is a slip of the keyboard, not a piece (10 × 10 × 10 m). */
const MAX_VOLUME_PER_PIECE_M3 = 1000;

/**
 * The m³ typed for one piece as stored: a plain number with a point and nothing else ("0,50" →
 * "0.5", ".5" → "0.5"), "" when blank. Anything else is refused - a unit, an exponent, a minus,
 * more than MAX_VOLUME_PER_PIECE_M3 - as it would count wrongly in the shipment's volume and its
 * freight tons, which a master job's costs are split by.
 */
function typedVolumePerPiece(value: string | null | undefined, row: number): string {
  const typed = (value ?? "").trim().replace(",", ".");
  if (!typed) return "";
  if (typed.startsWith("-")) throw APIError.invalidArgument(`Cargo line ${row}: volume per piece cannot be negative`);
  const parts = /^(\d*)(?:\.(\d*))?$/.exec(typed);
  if (!parts || !(parts[1] || parts[2])) throw APIError.invalidArgument(`Cargo line ${row}: volume per piece must be a number of m³ (e.g. 0.5)`);
  const whole = parts[1]!.replace(/^0+(?=\d)/, "") || "0";
  const decimals = (parts[2] ?? "").replace(/0+$/, "");
  const volume = decimals ? `${whole}.${decimals}` : whole;
  if (Number(volume) > MAX_VOLUME_PER_PIECE_M3) {
    throw APIError.invalidArgument(`Cargo line ${row}: volume per piece cannot be more than ${MAX_VOLUME_PER_PIECE_M3} m³`);
  }
  return volume;
}

/**
 * A cargo dimension line with its pallet / ADR fields as stored: blanks become null, the UN
 * number is its four digits ("UN 1203" → "1203"), pallet type and packing group in capitals.
 * The volume typed for a piece is kept only while the line's length, width and height are not
 * all known (with all three the volume is theirs), as a plain number (typedVolumePerPiece).
 * `row` (1-based) names the line in the message when a value is refused.
 */
export function normalizeCargoDimension<T extends CargoDimensionLine>(line: T, row: number): T {
  const palletType = blank(line.palletType) ? null : line.palletType!.trim().toUpperCase();
  if (palletType !== null && !PALLET_TYPES.includes(palletType as PalletType)) {
    throw APIError.invalidArgument(`Cargo line ${row}: pallet type must be one of ${PALLET_TYPES.join(", ")}`);
  }
  const adrUn = blank(line.adrUn) ? null : line.adrUn!.trim().replace(/^UN\s*/i, "");
  if (adrUn !== null && !/^\d{4}$/.test(adrUn)) {
    throw APIError.invalidArgument(`Cargo line ${row}: UN number must be 4 digits (e.g. 1203)`);
  }
  const adrPackingGroup = blank(line.adrPackingGroup) ? null : line.adrPackingGroup!.trim().toUpperCase();
  if (adrPackingGroup !== null && !ADR_PACKING_GROUPS.includes(adrPackingGroup as AdrPackingGroup)) {
    throw APIError.invalidArgument(`Cargo line ${row}: packing group must be I, II or III`);
  }
  // A typed volume beside all three sizes is not kept, nor read: the sizes say what it is.
  const volumePerPcM3 = hasAllSizes(line) ? "" : typedVolumePerPiece(line.volumePerPcM3, row);
  return {
    ...line,
    volumePerPcM3,
    palletType: palletType as PalletType | null,
    adrUn,
    adrClass: blank(line.adrClass) ? null : line.adrClass!.trim(),
    adrPackingGroup: adrPackingGroup as AdrPackingGroup | null,
    adrLimitedQuantity: line.adrLimitedQuantity === true,
  };
}

/** Every line of a write normalised (undefined when the write does not touch the lines). */
export function normalizeCargoDimensions<T extends CargoDimensionLine>(lines: T[] | undefined): T[] | undefined {
  return lines?.map((line, i) => normalizeCargoDimension(line, i + 1));
}
