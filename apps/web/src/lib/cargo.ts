import type { interfaces } from "@/lib/api/client";

// ── Dictionaries (mirrored 1:1 from the agreed spec; the backend derives TEU
// with the same 20'→1 / 40'→2 rule) ──

export const CONTAINER_SIZES = ["20'", "40'", "45'"] as const;
export const CONTAINER_KINDS = ["DC", "HC", "RF", "HRF", "OT", "HOT", "FR"] as const;
// The equipment offered per size. A 20' comes without a high cube; the high-cube reefer (HRF) and
// flat rack (HFR) only as a 40', which has no standard-height reefer; 45-foot only as a high cube.
export const CONTAINER_KINDS_BY_SIZE: Record<string, readonly string[]> = {
  "20'": ["DC", "RF", "OT", "HOT", "FR"],
  "40'": ["DC", "HC", "HRF", "OT", "HOT", "FR", "HFR"],
  "45'": ["HQ"],
};
export const CONTAINER_TYPES = CONTAINER_SIZES.flatMap((s) => (CONTAINER_KINDS_BY_SIZE[s] ?? CONTAINER_KINDS).map((k) => `${s} ${k}`));

/**
 * A container type as the dictionary names it today: the dry box was "GP" before it was "DC", and
 * quotes and shipments saved before keep "20' GP" / "40' GP" - read as "20' DC" / "40' DC".
 */
export function containerType(type: string | null | undefined): string {
  return (type ?? "").trim().replace(/^(\d\d')\s*GP$/i, "$1 DC");
}

export function teuForType(type: string): number {
  const t = (type ?? "").trim();
  // A 45' box occupies two 40' slots' worth of TEU, same as a 40'.
  if (t.startsWith("45") || t.startsWith("40")) return 2;
  if (t.startsWith("20")) return 1;
  return 0;
}

export const PACK_TYPES = ["Pallet(s)", "Cartons", "Colli", "Boxes", "Wooden boxes", "Drums"];

/** The package types as the options of a package-type Select (picked from the list only). */
export const PACK_TYPE_OPTIONS = PACK_TYPES.map((p) => ({ value: p }));

// A dimension row is either both stackable and overstowable, or neither.
export const STACKABLE = "Stackable / Overstowable";
export const NOT_STACKABLE = "Not stackable / Not overstowable";
export const STACKABLE_OPTIONS = [STACKABLE, NOT_STACKABLE];

/**
 * A shipment's stackability from its dimension rows: one row that is not stackable makes the
 * whole shipment not stackable; otherwise one stackable row makes it stackable; "" when no
 * row says either.
 */
export function shipmentStackability(rows: { stackable: string }[]): string {
  if (rows.some((r) => r.stackable === NOT_STACKABLE)) return NOT_STACKABLE;
  if (rows.some((r) => r.stackable === STACKABLE)) return STACKABLE;
  return "";
}

/**
 * The dimension rows with a stackability picked for the whole shipment: every row takes it.
 * A shipment without rows gets one holding only the stackability (on `containerId`), so the
 * rows stay the one place it is kept. Clearing it ("") on a shipment without rows adds none.
 */
export function withShipmentStackability(
  rows: CargoDimensionLine[],
  stackable: string,
  containerId: string | null = null,
): CargoDimensionLine[] {
  if (rows.length > 0) return rows.map((r) => ({ ...r, stackable }));
  if (!stackable) return [];
  return [{ containerId, pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable }];
}

// Road freight: the ADR (dangerous goods) details of a dimension line.
export const ADR_PACKING_GROUPS: interfaces.AdrPackingGroup[] = ["I", "II", "III"];

/** Whether a dimension line carries any ADR detail. */
export const hasAdr = (l: interfaces.CargoDimensionLine): boolean =>
  !!(l.adrUn || l.adrClass || l.adrPackingGroup || l.adrLimitedQuantity);

/**
 * The ADR details of a line in one short text, e.g. "UN 1203 / Cls: 3 / PG II / LQ". A UN
 * number typed with its prefix ("UN2382", "un 2382") shows the prefix once: "UN 2382".
 */
export const adrSummary = (l: interfaces.CargoDimensionLine): string =>
  [l.adrUn?.trim() && `UN ${l.adrUn.trim().replace(/^UN\s*/i, "")}`, l.adrClass?.trim() && `Cls: ${l.adrClass.trim()}`, l.adrPackingGroup && `PG ${l.adrPackingGroup}`, l.adrLimitedQuantity && "LQ"]
    .filter(Boolean)
    .join(" / ");

export const CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "INR", name: "Indian Rupee" },
  { code: "CNY", name: "Chinese Yuan Renminbi" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "KRW", name: "South Korean Won" },
  { code: "TWD", name: "New Taiwan Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "ZAR", name: "South African Rand" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "RUB", name: "Russian Ruble" },
];

// ── Shared parsing / formatting (same rules as the backend projection) ──

export function num(v: string | null | undefined): number {
  const n = parseFloat(
    String(v ?? "")
      .replace(/[^0-9.,-]/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : 0;
}

// What a number field accepts while typing: digits only, plus — when decimals are allowed —
// one decimal point (a typed comma becomes a point). Letters and other characters are dropped,
// and the whole-number part keeps at most maxDigits digits (extra ones are cut off).
export function numberInput(v: string, decimals = true, maxDigits = Infinity): string {
  const s = v.replace(",", ".");
  if (!decimals) return s.replace(/\D/g, "").slice(0, maxDigits);
  const [whole = "", ...rest] = s.replace(/[^\d.]/g, "").split(".");
  const w = whole.slice(0, maxDigits);
  return rest.length ? `${w}.${rest.join("")}` : w;
}

// "All pieces" in Cargo Details: weight and volume typed for all the pieces of a dimension line are
// stored per piece. A line without pieces has no totals - there is nothing to share one over - so
// its pieces count 0, as the totals row and the server count them.
export const piecesOf = (l: { pieces?: string | null }) => Math.max(0, Math.floor(num(l.pieces)));

/** The most m³ one piece may hold (the server refuses more: a slip of the keyboard, not a piece). */
export const MAX_VOLUME_PER_PIECE_M3 = 1000;

/**
 * A number as a plain decimal with `significant` digits and no trailing zeros ("150", "0.5",
 * "0.000000333333333333") - never "3.3e-7", which the server does not take; "" for none.
 */
export function plainDecimal(n: number, significant = 12): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const decimals = Math.min(100, Math.max(0, significant - 1 - Math.floor(Math.log10(n))));
  const fixed = n.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * One piece's share of a total, as stored: 12 significant digits, so pieces × share gives the total
 * back as typed even over thousands of pieces (7 m³ over 3,000 pieces is 0.00233333333333, not
 * 0.002333 = 6.999 m³); "" for none or without pieces.
 */
export const perPieceText = (total: number, pieces: number) => (total > 0 && pieces > 0 ? plainDecimal(total / pieces) : "");

/** A line's total from its per-piece value, rounded as shown (weight 2 decimals, volume 3); "" for none or without pieces. */
export const totalText = (perPiece: number, pieces: number, decimals: number) =>
  perPiece > 0 && pieces > 0 ? String(Number((perPiece * pieces).toFixed(decimals))) : "";

/**
 * The total a line's per-piece share was made from: pieces × share to 10 significant digits, which
 * undoes the share's own rounding - so sharing it out again over other pieces, keystroke after
 * keystroke, never drifts away from what was typed. 0 for none.
 */
export const lineTotal = (perPiece: number, pieces: number) => (perPiece > 0 && pieces > 0 ? Number((perPiece * pieces).toPrecision(10)) : 0);

// en-US thousands separators; integers plain, otherwise at most 2 decimals.
export function fmtNum(n: number): string {
  return n % 1 === 0
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Fixed-decimal variant for the TOTAL comparison rows (weights 2, volumes 3).
export function fmtFixed(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Dimension math + the Matched/Mismatch check ──

export type CargoDimensionLine = interfaces.CargoDimensionLine;
export type CargoItemLine = interfaces.CargoItemLine;
export type ContainerLine = interfaces.ContainerLine;

// The sizes of a piece (in cm) and the volume typed for it: what its volume is worked out from.
type VolumeSource = Pick<CargoDimensionLine, "lengthCm" | "widthCm" | "heightCm" | "volumePerPcM3">;

/** Whether all three sizes of a piece are known (each above 0): then its volume is worked out from them. */
export const hasAllSizes = (d: VolumeSource): boolean => num(d.lengthCm) > 0 && num(d.widthCm) > 0 && num(d.heightCm) > 0;

// Volume of one piece in m³: from its sizes in cm (cm³ → m³) when all three are known, else the
// volume typed for it, as the sizes are not always known. The same rule as the server's.
export function dimensionVolumePerPiece(d: VolumeSource): number {
  return hasAllSizes(d) ? (num(d.lengthCm) * num(d.widthCm) * num(d.heightCm)) / 1e6 : num(d.volumePerPcM3);
}

/** The m³ of a whole dimension line: its pieces × the volume of one (sizes in cm). */
export const dimensionLineVolume = (d: VolumeSource & Pick<CargoDimensionLine, "pieces">): number => num(d.pieces) * dimensionVolumePerPiece(d);

/**
 * An edited line once a change gave it all three sizes: without the volume typed for it, as the
 * server keeps none beside them - so a hidden old value cannot come back when a size is cleared
 * again. Either unit: a size above 0 is above 0 in both.
 */
export function withoutTypedVolumeWhenSized<L extends VolumeSource>(l: L): L {
  return hasAllSizes(l) && l.volumePerPcM3 ? { ...l, volumePerPcM3: "" } : l;
}

export interface DimensionTotals {
  pcs: number;
  kg: number;
  m3: number;
}

// ── Dimension units ──
// The server stores the sizes of a dimension line in cm; dimensionUnit says whether the line
// was typed in cm or inches. The editors (Cargo Details, the Dimensions dialog) hold a line in
// its own unit and convert at the edges: lineInUnit when it comes from the server,
// lineInCm when it is sent or measured. 1 in = 2.54 cm exactly, rounded to 4 decimals, so an
// inch value with up to 4 decimals goes there and back unchanged (44 in -> 111.76 cm -> 44 in).
export const INCH_CM = 2.54;
export type DimensionUnit = interfaces.DimensionUnit;
export const DIMENSION_UNITS: { value: DimensionUnit; label: string }[] = [
  { value: "cm", label: "CM" },
  { value: "in", label: "INCH" },
];
// What the conversion needs of a line: its three sizes and their unit. A full dimension line
// has them, and so has a row of the grid's Dimensions column (columnConfig).
type SizedLine = Pick<CargoDimensionLine, "lengthCm" | "widthCm" | "heightCm" | "dimensionUnit">;
const round4 = (n: number) => String(Math.round(n * 1e4) / 1e4);
// An empty or non-numeric size is left as it is.
const convertSizes = <L extends SizedLine>(l: L, f: (n: number) => number): L => {
  const size = (v: string) => {
    const t = (v ?? "").trim();
    return t === "" || Number.isNaN(Number(t)) ? v : round4(f(Number(t)));
  };
  return { ...l, lengthCm: size(l.lengthCm), widthCm: size(l.widthCm), heightCm: size(l.heightCm) };
};
/** A line from the server (sizes in cm) shown in its own unit. */
export const lineInUnit = <L extends SizedLine>(l: L): L =>
  l.dimensionUnit === "in" ? convertSizes(l, (cm) => cm / INCH_CM) : l;
/** A line held in its own unit, with its sizes in cm (to send, or to measure volume). */
export const lineInCm = <L extends SizedLine>(l: L): L =>
  l.dimensionUnit === "in" ? convertSizes(l, (inch) => inch * INCH_CM) : l;
/** The short unit written after a line's sizes: "in" or "cm". */
export const unitLabel = (u?: DimensionUnit | null) => (u === "in" ? "in" : "cm");

// A dimension line with nothing in it: never saved. The pallet type and ADR count, so
// a line holding only those (typed in Cargo Details) survives a save from the grid's
// Dimensions dialog, which does not show them.
export function dimensionLineIsEmpty(l: CargoDimensionLine): boolean {
  return (
    !l.pieces && !l.lengthCm && !l.widthCm && !l.heightCm && !l.weightPerPcKg && !l.volumePerPcM3?.trim() && !l.packageType && !l.stackable &&
    !l.palletType?.trim() && !l.adrUn?.trim() && !l.adrClass?.trim() && !l.adrPackingGroup?.trim() && !l.adrLimitedQuantity
  );
}

export function dimensionTotals(dims: CargoDimensionLine[]): DimensionTotals {
  return dims.reduce(
    (t, d) => {
      const q = num(d.pieces);
      t.pcs += q;
      t.kg += q * num(d.weightPerPcKg);
      t.m3 += dimensionLineVolume(d);
      return t;
    },
    { pcs: 0, kg: 0, m3: 0 },
  );
}

// Compare a container's declared Pieces/Gross Weight/Volume against the sums of
// its dimension lines, at the precision the totals are shown in (pcs 0, kg 2, m³ 3
// decimals), so the colour always agrees with the figures on screen. A metric
// where both sides are empty doesn't participate (ok stays true).
export interface FigureCheck {
  sum: number;
  declared: number;
  empty: boolean;
  ok: boolean;
}

export interface ConsistencyCheck {
  matched: boolean;
  pcs: FigureCheck;
  kg: FigureCheck;
  m3: FigureCheck;
}

export function compareFigure(sum: number, declared: number, decimals: number): FigureCheck {
  const empty = !sum && !declared;
  return { sum, declared, empty, ok: empty || fmtFixed(sum, decimals) === fmtFixed(declared, decimals) };
}

export function checkConsistency(container: ContainerLine, dims: CargoDimensionLine[]): ConsistencyCheck {
  const t = dimensionTotals(dims);
  const pcs = compareFigure(t.pcs, num(container.packages), 0);
  const kg = compareFigure(t.kg, num(container.grossWeight), 2);
  const m3 = compareFigure(t.m3, num(container.volume), 3);
  return { matched: pcs.ok && kg.ok && m3.ok, pcs, kg, m3 };
}

// Commercial invoice value summed per currency: "12 500 USD, 3 000 EUR".
// An empty currency counts as USD.
export function civByCurrency(items: CargoItemLine[]): string {
  const byCurrency = new Map<string, number>();
  for (const item of items) {
    const value = num(item.commercialInvoiceValue);
    if (!value) continue;
    const currency = (item.currency ?? "").trim().toUpperCase() || "USD";
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + value);
  }
  return [...byCurrency.entries()].map(([c, v]) => `${fmtNum(v)} ${c}`).join(", ");
}
