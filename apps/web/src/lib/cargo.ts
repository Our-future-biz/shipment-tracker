import type { interfaces } from "@/lib/api/client";

// ── Dictionaries (mirrored 1:1 from the agreed spec; the backend derives TEU
// with the same 20'→1 / 40'→2 rule) ──

export const CONTAINER_SIZES = ["20'", "40'"] as const;
export const CONTAINER_KINDS = ["GP", "HC", "RF", "HR", "OT", "HOT", "FR"] as const;
export const CONTAINER_TYPES = CONTAINER_SIZES.flatMap((s) => CONTAINER_KINDS.map((k) => `${s} ${k}`));

export function teuForType(type: string): number {
  const t = (type ?? "").trim();
  if (t.startsWith("40")) return 2;
  if (t.startsWith("20")) return 1;
  return 0;
}

export const PACK_TYPES = ["Pallet(s)", "Cartons", "Colli", "Boxes", "Wooden boxes", "Drums"];

export const STACKABLE_OPTIONS = ["Stackable", "Non-stackable", "Overstowable", "Non-overstowable"];

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
