// The warehouse's remeasured lines (Shipment Details → remeasure_rows): a JSON list of
// { pieces, lengthCm, widthCm, heightCm, weightPerPcKg } with the numbers as text. Pure helpers.

import { InputError } from "./inputError";

export type RemeasureTotals = { lines: number; pieces: number; weightKg: number; cbm: number };

// Strict number: "" (or missing) is 0, a plain non-negative number (decimal comma accepted) is
// that number, anything else is refused — never silently 0.
function num(v: unknown, label: string, line: number, whole = false): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0 || (whole && !Number.isInteger(v))) throw new InputError(`Line ${line}: ${label} is not valid`);
    return v;
  }
  const t = (typeof v === "string" ? v : v === undefined || v === null ? "" : "x").trim().replace(",", ".");
  if (!t) return 0;
  if (!/^\d+(\.\d+)?$/.test(t)) throw new InputError(`Line ${line}: ${label} is not a number`);
  const n = Number(t);
  if (whole && !Number.isInteger(n)) throw new InputError(`Line ${line}: ${label} must be a whole number`);
  return n;
}

/**
 * Totals of the saved lines: pieces, gross kg (pieces × kg per piece, 0.1 kg) and cbm
 * (pieces × L × W × H, 0.001 cbm). Throws an Error naming the line when a value is not a number.
 */
export function remeasureTotals(raw: unknown): RemeasureTotals {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw || "[]");
    } catch {
      throw new InputError("The remeasured lines cannot be read");
    }
  }
  if (!Array.isArray(list)) throw new InputError("The remeasured lines cannot be read");
  let pieces = 0;
  let kg = 0;
  let cbm = 0;
  list.forEach((r, i) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new InputError(`Line ${i + 1} cannot be read`);
    const o = r as Record<string, unknown>;
    const n = num(o.pieces, "Qty", i + 1, true);
    pieces += n;
    kg += n * num(o.weightPerPcKg, "kg per piece", i + 1);
    cbm += (n * num(o.lengthCm, "length", i + 1) * num(o.widthCm, "width", i + 1) * num(o.heightCm, "height", i + 1)) / 1_000_000;
  });
  return { lines: list.length, pieces, weightKg: Math.round(kg * 10) / 10, cbm: Math.round(cbm * 1000) / 1000 };
}
