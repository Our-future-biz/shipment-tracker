import type { interfaces } from "@/lib/api/client";

// ── Dictionaries (mirrored 1:1 from the agreed spec; the backend derives TEU
// with the same 20'→1 / 40'→2 rule) ──

export const CONTAINER_SIZES = ["20'", "40'", "45'"] as const;
export const CONTAINER_KINDS = ["GP", "HC", "RF", "HRF", "OT", "HOT", "FR"] as const;
// The equipment offered per size. A 20' comes without a high cube; the high-cube reefer (HRF) and
// flat rack (HFR) only as a 40', which has no standard-height reefer; 45-foot only as a high cube.
export const CONTAINER_KINDS_BY_SIZE: Record<string, readonly string[]> = {
  "20'": ["GP", "RF", "OT", "HOT", "FR"],
  "40'": ["GP", "HC", "HRF", "OT", "HOT", "FR", "HFR"],
  "45'": ["HQ"],
};
export const CONTAINER_TYPES = CONTAINER_SIZES.flatMap((s) => (CONTAINER_KINDS_BY_SIZE[s] ?? CONTAINER_KINDS).map((k) => `${s} ${k}`));

export function teuForType(type: string): number {
  const t = (type ?? "").trim();
  // A 45' box occupies two 40' slots' worth of TEU, same as a 40'.
  if (t.startsWith("45") || t.startsWith("40")) return 2;
  if (t.startsWith("20")) return 1;
  return 0;
}

export const PACK_TYPES = ["Pallet(s)", "Cartons", "Colli", "Boxes", "Wooden boxes", "Drums"];

/** Package types matching what is typed, for the package-type autocompletes. */
export const packTypeOptions = (query: string) =>
  PACK_TYPES.filter((p) => p.toLowerCase().includes((query ?? "").toLowerCase().trim())).map((p) => ({ value: p }));

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

// Road freight: the pallet a dimension line stands on, and its ADR (dangerous goods) details.
export const PALLET_TYPES: { value: interfaces.PalletType; label: string }[] = [
  { value: "EUR", label: "EUR 120×80" },
  { value: "INDUSTRIAL", label: "Industrial 120×100" },
  { value: "HALF", label: "Half 80×60" },
  { value: "QUARTER", label: "Quarter 60×40" },
  { value: "OTHER", label: "Other" },
];
export const ADR_PACKING_GROUPS: interfaces.AdrPackingGroup[] = ["I", "II", "III"];

/** Whether a dimension line carries any ADR detail. */
export const hasAdr = (l: interfaces.CargoDimensionLine): boolean =>
  !!(l.adrUn || l.adrClass || l.adrPackingGroup || l.adrLimitedQuantity);

/** The ADR details of a line in one short text, e.g. "UN 1203 · 3 · PG II · LQ". */
export const adrSummary = (l: interfaces.CargoDimensionLine): string =>
  [l.adrUn && `UN ${l.adrUn}`, l.adrClass, l.adrPackingGroup && `PG ${l.adrPackingGroup}`, l.adrLimitedQuantity && "LQ"]
    .filter(Boolean)
    .join(" · ");

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

// Volume of one piece in m³ (cm³ → m³); derived live, never stored.
export function dimensionVolumePerPiece(d: CargoDimensionLine): number {
  return (num(d.lengthCm) * num(d.widthCm) * num(d.heightCm)) / 1e6;
}

export interface DimensionTotals {
  pcs: number;
  kg: number;
  m3: number;
}

export function dimensionTotals(dims: CargoDimensionLine[]): DimensionTotals {
  return dims.reduce(
    (t, d) => {
      const q = num(d.pieces);
      t.pcs += q;
      t.kg += q * num(d.weightPerPcKg);
      t.m3 += q * dimensionVolumePerPiece(d);
      return t;
    },
    { pcs: 0, kg: 0, m3: 0 },
  );
}

// Compare a container's declared Pieces/Gross Weight/Volume against the sums of
// its dimension lines. Tolerance 0.001 absorbs floating point noise. A metric
// where both sides are empty doesn't participate (ok stays true).
export interface ConsistencyCheck {
  matched: boolean;
  pcs: { sum: number; declared: number; empty: boolean; ok: boolean };
  kg: { sum: number; declared: number; empty: boolean; ok: boolean };
  m3: { sum: number; declared: number; empty: boolean; ok: boolean };
}

export function checkConsistency(container: ContainerLine, dims: CargoDimensionLine[]): ConsistencyCheck {
  const t = dimensionTotals(dims);
  const compare = (sum: number, declared: number) => {
    const empty = !sum && !declared;
    return { sum, declared, empty, ok: empty || Math.abs(sum - declared) < 0.001 };
  };
  const pcs = compare(t.pcs, num(container.packages));
  const kg = compare(t.kg, num(container.grossWeight));
  const m3 = compare(t.m3, num(container.volume));
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
