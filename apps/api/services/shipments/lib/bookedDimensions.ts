import type { AdrPackingGroup, CargoDimensionLine } from "../interfaces/interfaces";
import { NOT_STACKABLE, STACKABLE } from "./cargoProjection";

// Booked Dimensions (owner's answer 22 Nov): the package lines of the quote a shipment was made from, as
// cargo dimension lines - copied by the server from the quote itself and never edited, so Cargo Details
// can hold the shipment's Dimensions against what was booked. The same lines the web copies into the
// shipment's Dimensions when it is made (apps/web shipments/_components/quoteToShipment), each the
// quote's package line: its quantity, sizes in cm, kg per piece, package type and stackability, and the
// quote's dangerous goods on every line. A quote without package lines (a container quote) books none.

// A quote's figure as a line keeps it: "" for none or 0, as the web's copy writes it.
const text = (v: unknown): string => (v == null || v === 0 ? "" : typeof v === "string" || typeof v === "number" ? String(v) : "");

// The quote's package type as a shipment's: the quote says "Pallets", the shipment "Pallet(s)".
const packageType = (t: unknown): string => (t === "Pallets" ? "Pallet(s)" : typeof t === "string" ? t : "");

const objects = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];

const PACKING_GROUPS: readonly AdrPackingGroup[] = ["I", "II", "III"];

// The dangerous goods a quote names, as a line takes them; null when it names none. A UN number
// that is not four digits stays behind, as on the web's copy (the shipment would refuse it).
function quoteAdr(data: Record<string, unknown>): Pick<CargoDimensionLine, "adrUn" | "adrClass" | "adrPackingGroup" | "adrLimitedQuantity"> | null {
  const adr = data.adr;
  if (data.dangerous !== true || !adr || typeof adr !== "object") return null;
  const a = adr as Record<string, unknown>;
  const un = (typeof a.adrUn === "string" ? a.adrUn : "").trim().replace(/^UN\s*/i, "");
  const cls = typeof a.adrClass === "string" ? a.adrClass.trim() : "";
  const group = PACKING_GROUPS.find((g) => g === a.adrPackingGroup) ?? null;
  const out = { adrUn: /^\d{4}$/.test(un) ? un : null, adrClass: cls || null, adrPackingGroup: group, adrLimitedQuantity: a.adrLimitedQuantity === true };
  return out.adrUn || out.adrClass || out.adrPackingGroup || out.adrLimitedQuantity ? out : null;
}

/** The quote's package lines as Booked Dimensions; none for a quote without them. */
export function bookedDimensionsFromQuote(data: unknown): CargoDimensionLine[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const quote = data as Record<string, unknown>;
  const adr = quoteAdr(quote);
  return objects(quote.packages)
    .filter((p) => p.qty || p.length || p.width || p.height || p.weight)
    .map((p) => ({
      containerId: null,
      pieces: text(p.qty),
      lengthCm: text(p.length),
      widthCm: text(p.width),
      heightCm: text(p.height),
      weightPerPcKg: text(p.weight),
      packageType: packageType(p.type),
      stackable: p.stackable === true ? STACKABLE : p.stackable === false ? NOT_STACKABLE : "",
      ...(adr ?? {}),
    }));
}
