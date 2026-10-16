// Cargo figures side by side — declared on the shipment, received at the gate, remeasured by the
// warehouse — with the variance rule: any difference in pieces, or more than 5 % on weight or
// volume. Pure helpers (tested in cargoCompare.test.ts).

export type CargoTotals = { pieces: number; kg: number; cbm: number };

/** One remeasured line as stored (numbers as text): pieces, L × W × H in cm, kg per piece. */
export type RemeasureLine = { pieces: string; lengthCm: string; widthCm: string; heightCm: string; weightPerPcKg: string };

export const LINE_FIELDS = ["pieces", "lengthCm", "widthCm", "heightCm", "weightPerPcKg"] as const;
export type LineField = (typeof LINE_FIELDS)[number];
export const EMPTY_LINE: RemeasureLine = { pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" };

/** Tolerance on weight and volume (pieces must match exactly). */
export const TOLERANCE = 0.05;

/**
 * Strict number from a stored value: "" is 0, a plain non-negative number (a decimal comma is
 * accepted) is that number, anything else is NaN — never silently 0.
 */
export function toNum(v: string | number | undefined | null): number {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : NaN;
  const t = (v ?? "").trim().replace(",", ".");
  if (!t) return 0;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export const fieldInvalid = (r: RemeasureLine, f: LineField) => {
  const n = toNum(r[f]);
  return Number.isNaN(n) || (f === "pieces" && !Number.isInteger(n));
};
export const lineInvalid = (r: RemeasureLine) => LINE_FIELDS.some((f) => fieldInvalid(r, f));
export const lineFilled = (r: RemeasureLine) => LINE_FIELDS.some((f) => r[f].trim() !== "");

/** The saved lines (JSON text) as editable lines; anything unreadable is no lines. */
export function parseLines(json: unknown): RemeasureLine[] {
  if (typeof json !== "string" || !json) return [];
  try {
    const arr: unknown = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
      .map((r) => Object.fromEntries(LINE_FIELDS.map((f) => [f, r[f] == null ? "" : String(r[f])])) as RemeasureLine);
  } catch {
    return [];
  }
}

/** The lines as stored: only filled lines, numbers normalised (the same JSON shape Shipments reads). */
export function serializeLines(rows: RemeasureLine[]): string {
  const filled = rows
    .filter(lineFilled)
    .map((r) => Object.fromEntries(LINE_FIELDS.map((f) => [f, r[f].trim() ? String(toNum(r[f])) : ""])) as RemeasureLine);
  return JSON.stringify(filled);
}

/** Volume of one line in cbm (pieces × L × W × H / 1 000 000); invalid values count as 0. */
export function lineCbm(r: RemeasureLine): number {
  const n = (f: LineField) => toNum(r[f]) || 0;
  return (n("pieces") * n("lengthCm") * n("widthCm") * n("heightCm")) / 1_000_000;
}

/** Totals of the lines: pieces, gross kg (pieces × kg per piece) and cbm — rounded as the server does. */
export function linesTotals(rows: RemeasureLine[]): CargoTotals {
  let pieces = 0;
  let kg = 0;
  let cbm = 0;
  for (const r of rows) {
    const n = toNum(r.pieces) || 0;
    pieces += n;
    kg += n * (toNum(r.weightPerPcKg) || 0);
    cbm += lineCbm(r);
  }
  return { pieces, kg: Math.round(kg * 10) / 10, cbm: Math.round(cbm * 1000) / 1000 };
}

type DeclaredShipment = {
  pcs?: string | null;
  totalWeightTons?: string | null;
  totalVolumeCbm?: string | null;
  cargoDimensions?: { pieces: string; lengthCm: string; widthCm: string; heightCm: string; weightPerPcKg: string }[] | null;
};

const num = (v: string | null | undefined) => {
  const n = toNum(v ?? "");
  return Number.isNaN(n) ? 0 : n;
};

/**
 * What the shipment declares: its pieces, total weight (tonnes → kg) and volume; where a total is
 * missing, the sum of its cargo dimensions lines. null when the shipment declares nothing.
 */
export function declaredTotals(s: DeclaredShipment | null | undefined): CargoTotals | null {
  if (!s) return null;
  const dims = linesTotals((s.cargoDimensions ?? []).map((d) => ({ ...d })));
  const pieces = num(s.pcs) || dims.pieces;
  const kg = num(s.totalWeightTons) ? Math.round(num(s.totalWeightTons) * 1000 * 10) / 10 : dims.kg;
  const cbm = num(s.totalVolumeCbm) || dims.cbm;
  return pieces || kg || cbm ? { pieces, kg, cbm } : null;
}

/** Chargeable weight or measure: the larger of cbm and tonnes (2 decimals, as the storage clock). */
export const wm = (t: Pick<CargoTotals, "kg" | "cbm"> | null | undefined) => (t ? Math.round(Math.max(t.cbm, t.kg / 1000) * 100) / 100 : 0);

export type Variance = {
  /** Pieces differ (any difference). */
  pieces: boolean;
  /** Weight differs by more than the tolerance. */
  kg: boolean;
  cbm: boolean;
  wm: boolean;
  any: boolean;
  /** Relative differences (b against a), null when either side is 0 / unknown. */
  kgPct: number | null;
  cbmPct: number | null;
};

const rel = (a: number, b: number) => (a > 0 && b > 0 ? (b - a) / a : null);

/**
 * `b` against `a`: any piece difference, or more than `pct` on weight, volume or W/M. A figure
 * that is 0 (unknown) on either side is not compared.
 */
export function variance(a: CargoTotals | null, b: CargoTotals | null, { pct = TOLERANCE }: { pct?: number } = {}): Variance {
  if (!a || !b) return { pieces: false, kg: false, cbm: false, wm: false, any: false, kgPct: null, cbmPct: null };
  const pieces = a.pieces > 0 && b.pieces > 0 && a.pieces !== b.pieces;
  const kgPct = rel(a.kg, b.kg);
  const cbmPct = rel(a.cbm, b.cbm);
  const wmPct = rel(wm(a), wm(b));
  const over = (p: number | null) => p != null && Math.abs(p) > pct + 1e-9;
  const res = { pieces, kg: over(kgPct), cbm: over(cbmPct), wm: over(wmPct), kgPct, cbmPct };
  return { ...res, any: res.pieces || res.kg || res.cbm || res.wm };
}

/** "+12.5 %" / "−3.0 %" */
export const pctText = (p: number | null) => (p == null ? "" : `${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(1)} %`);

/**
 * The warehouse's re-weigh against the declared weight (kg): the share off and whether it is a
 * variance — the same tolerance as the remeasurement (more than 5 % either way). Not compared
 * (null, no flag) when either side is unknown.
 */
export function reweighVariance(weighedKg: number | null | undefined, declaredKg: number | null | undefined, { pct = TOLERANCE }: { pct?: number } = {}): { pct: number | null; flagged: boolean } {
  if (!weighedKg || weighedKg <= 0 || !declaredKg || declaredKg <= 0) return { pct: null, flagged: false };
  const p = (weighedKg - declaredKg) / declaredKg;
  return { pct: Math.round(p * 10_000) / 10_000, flagged: Math.abs(p) > pct + 1e-9 };
}
