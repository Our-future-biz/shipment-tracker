// The ONE catalogue of charge codes: what a cost or a selling line is for. Costs Breakdown,
// sales quotes, document reading, master jobs and invoicing all store the code and show the
// label. The twin of CHARGE_CODES in apps/web/src/lib/chargeCodes.ts - an API test compares
// the two, so a code is added in both or in neither.

/** The coarse groups of the older per-category costs (Freight, Locals, ...). */
export type ChargeGroup = "freight" | "collection" | "locals" | "customs" | "insurance" | "others";

/** The side of Costs Breakdown a charge is usually on. */
export type ChargeSide = "buy" | "sell" | "both";

export interface ChargeCodeEntry {
  code: string;
  label: string;
  group: ChargeGroup;
  side: ChargeSide;
  /** A generic key of the older per-category costs: still shown, no longer offered. */
  legacy?: boolean;
}

export const CHARGE_CODES: readonly ChargeCodeEntry[] = [
  { code: "ocean_freight", label: "Ocean freight", group: "freight", side: "both" },
  { code: "air_freight", label: "Air freight", group: "freight", side: "both" },
  { code: "rail_freight", label: "Rail freight", group: "freight", side: "both" },
  { code: "road_freight", label: "Road freight", group: "freight", side: "both" },
  { code: "documentation", label: "Documentation", group: "locals", side: "both" },
  { code: "thc_origin", label: "THC Origin", group: "locals", side: "both" },
  { code: "thc_destination", label: "THC Destination", group: "locals", side: "both" },
  { code: "customs", label: "Customs clearance", group: "customs", side: "both" },
  { code: "handling", label: "Handling", group: "locals", side: "both" },
  { code: "delivery", label: "Delivery", group: "collection", side: "both" },
  { code: "pickup", label: "Pickup", group: "collection", side: "both" },
  { code: "insurance", label: "Insurance", group: "insurance", side: "both" },
  { code: "inspection", label: "Inspection", group: "others", side: "both" },
  { code: "storage", label: "Storage", group: "others", side: "both" },
  { code: "demurrage", label: "Demurrage", group: "others", side: "both" },
  { code: "other", label: "Other", group: "others", side: "both" },
  // Generic keys rows were written with before the catalogue; each may mean several codes
  // above (Freight: ocean, air, rail or road), so their rows keep them.
  { code: "freight", label: "Freight", group: "freight", side: "both", legacy: true },
  { code: "collection", label: "Collection / Delivery", group: "collection", side: "both", legacy: true },
  { code: "locals", label: "Locals", group: "locals", side: "both", legacy: true },
];

// Older keys that mean exactly one code ("Others" is "Other").
const ALIASES: Record<string, string> = { others: "other" };

const byCode = new Map(CHARGE_CODES.map((c) => [c.code, c]));
const byLabel = new Map(CHARGE_CODES.map((c) => [c.label.toLowerCase(), c.code]));

/**
 * The code a category is stored under: a code as it is, a label ("Road freight") or an older
 * key as its code. Anything else - text typed before the catalogue - is kept as it was given.
 */
export function toChargeCode(value: string): string {
  const typed = value.trim();
  if (byCode.has(typed)) return typed;
  const lower = typed.toLowerCase();
  return ALIASES[lower] ?? byLabel.get(lower) ?? typed;
}

/** What a category reads as: the label of its code, or the stored text itself. */
export function chargeLabel(value: string): string {
  return byCode.get(toChargeCode(value))?.label ?? value;
}

/** The codes offered for new lines (the older generic keys are not). */
export const OFFERED_CHARGE_CODES = CHARGE_CODES.filter((c) => !c.legacy).map((c) => c.code);
