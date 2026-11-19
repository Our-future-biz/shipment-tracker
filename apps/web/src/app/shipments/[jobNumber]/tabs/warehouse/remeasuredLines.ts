import { dimensionTotals, hasAdr, num, shipmentDeclaredFigures, type CargoDimensionLine, type CargoItemLine } from "@/lib/cargo";
import type { CargoFigures } from "./RemeasureCompare";

// The warehouse's saved remeasured lines (its job section's remeasure_rows: a JSON list of
// { pieces, lengthCm, widthCm, heightCm, weightPerPcKg }, numbers as text), as Cargo Details shows
// them, and what the shipment's own figures are compared with. The server holds the same rules
// (services/shipments/lib/remeasureAccept and remeasureNotice). Pure.

export interface RemeasuredLine {
  pieces: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightPerPcKg: string;
}

// The warehouse's saved lines, those with pieces; none when they can't be read.
export function readRemeasuredLines(json: string | undefined): RemeasuredLine[] {
  try {
    const arr: unknown = JSON.parse(json || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
      .map((r) => {
        const t = (k: string) => (typeof r[k] === "string" || typeof r[k] === "number" ? String(r[k]).trim() : "");
        return { pieces: t("pieces"), lengthCm: t("lengthCm"), widthCm: t("widthCm"), heightCm: t("heightCm"), weightPerPcKg: t("weightPerPcKg") };
      })
      .filter((l) => num(l.pieces) > 0);
  } catch {
    return [];
  }
}

const FIELDS: [keyof RemeasuredLine, string][] = [
  ["pieces", "Qty"],
  ["lengthCm", "length"],
  ["widthCm", "width"],
  ["heightCm", "height"],
  ["weightPerPcKg", "kg per piece"],
];
// In the server's order: the weight first, then the sizes.
const MEASURED: [keyof RemeasuredLine, string][] = [
  ["weightPerPcKg", "kg per piece"],
  ["lengthCm", "length"],
  ["widthCm", "width"],
  ["heightCm", "height"],
];

/**
 * A plain number as the warehouse may type it - digits with one decimal point, a point at either
 * end too ("120.", ".5"), a decimal comma read as a point. The server takes the same and no more.
 */
const PLAIN_NUMBER = /^(\d+(\.\d*)?|\.\d+)$/;

/** A typed figure tidied as stored: "120." is "120", ".5" is "0.5", "1,5" is "1.5". */
export function tidyNumber(v: string): string {
  const t = v.trim().replace(",", ".");
  if (!PLAIN_NUMBER.test(t)) return v.trim();
  return t.startsWith(".") ? `0${t}` : t.endsWith(".") ? t.slice(0, -1) : t;
}

/** "length", "length or width", "length, width or height". */
const orList = (words: string[]) => (words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`);

/**
 * Why the warehouse's saved lines can't be accepted yet, or null: a figure that is no plain number,
 * pieces that are no whole number, or a line with pieces lacking its kg per piece or one of its
 * sizes (empty or 0), which would write an empty weight or volume over the shipment's. The line is
 * numbered as in the warehouse's list. The API refuses the same, in the same words
 * (services/shipments/lib/remeasureAccept).
 */
export function unmeasuredReason(json: string | undefined): string | null {
  let arr: unknown;
  try {
    arr = JSON.parse(json || "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const rows = arr.map((r) => (r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : null));
  for (const [i, o] of rows.entries()) {
    if (!o) continue;
    const t = (k: string) => (typeof o[k] === "string" || typeof o[k] === "number" ? String(o[k]).trim().replace(",", ".") : "");
    const bad = FIELDS.find(([k]) => t(k) && !PLAIN_NUMBER.test(t(k)));
    if (bad) return `Remeasured line ${i + 1}: ${bad[1]} is not a number`;
    if (t("pieces") && !Number.isInteger(Number(tidyNumber(t("pieces"))))) return `Remeasured line ${i + 1}: Qty must be a whole number`;
  }
  for (const [i, o] of rows.entries()) {
    if (!o) continue;
    const t = (k: string) => (typeof o[k] === "string" || typeof o[k] === "number" ? String(o[k]).trim() : "");
    if (num(t("pieces")) <= 0) continue;
    const missing = MEASURED.filter(([k]) => !(num(t(k)) > 0)).map(([, label]) => label);
    if (missing.length) return `Remeasured line ${i + 1} has no ${orList(missing)}: the warehouse must measure weight and sizes of every line before it can be accepted`;
  }
  return null;
}

/**
 * Whether two saved texts hold the same remeasured lines - also saved with other spacing, key order
 * or a point tidied away: the lines an acceptance took over are not accepted again.
 */
export function sameRemeasuredLines(a: string, b: string): boolean {
  if (a === b) return true;
  const read = (t: string) => JSON.stringify(readRemeasuredLines(t).map((l) => Object.fromEntries(FIELDS.map(([k]) => [k, tidyNumber(l[k])]))));
  return readRemeasuredLines(a).length > 0 && read(a) === read(b);
}

export const lineCbm = (l: RemeasuredLine) => (num(l.pieces) * num(l.lengthCm) * num(l.widthCm) * num(l.heightCm)) / 1_000_000;

/**
 * Figures rounded as they are compared and shown everywhere - kg to 0.1, m³ to 0.001 - on both
 * sides alike (the server's roundedFigures), so lines of 7 × 13.25 kg (92.75) and a Total Weight of
 * 92.8 kg are the same weight.
 */
export const roundedFigures = (f: CargoFigures): CargoFigures => ({ colli: f.colli, weightKg: Math.round(f.weightKg * 10) / 10, volumeCbm: Math.round(f.volumeCbm * 1000) / 1000 });

export function remeasuredFigures(lines: RemeasuredLine[]): CargoFigures {
  const colli = lines.reduce((s, l) => s + num(l.pieces), 0);
  const kg = lines.reduce((s, l) => s + num(l.pieces) * num(l.weightPerPcKg), 0);
  const cbm = lines.reduce((s, l) => s + lineCbm(l), 0);
  return roundedFigures({ colli, weightKg: kg, volumeCbm: cbm });
}

/**
 * What the remeasurement is held against, as the server holds it when the warehouse informs
 * (remeasureNotice dimensionFiguresFilled): the totals of the shipment's cargo dimension lines, a
 * figure they lack - no kg per piece typed, the weight only in Total Weight - from its Pcs, Total
 * Weight and Total Volume, rounded as the remeasured figures are.
 */
export function shipmentCargoFigures(s: { cargoDimensions?: CargoDimensionLine[] | null; pcs?: string | null; totalWeightTons?: string | null; totalVolumeCbm?: string | null }): CargoFigures {
  const t = dimensionTotals(s.cargoDimensions ?? []);
  const typed = shipmentDeclaredFigures(s);
  return roundedFigures({ colli: t.pcs || num(typed.packages), weightKg: t.kg || num(typed.grossWeight), volumeCbm: t.m3 || num(typed.volume) });
}

/** The lines the last acceptance took over, again: the server refuses them in these words. */
export const ALREADY_ACCEPTED = "These remeasured lines were already accepted: the warehouse has saved nothing new since";

export const ACCEPT_BY_HAND =
  "Dangerous goods or several containers are on these lines and the warehouse saved a different number of lines: update Cargo Details by hand";

/**
 * Why the remeasured lines can't replace the shipment's, or null: line n keeps its container,
 * packing and dangerous goods from the shipment's line n, so with another number of lines a UN
 * number would vanish or move, and the lines of several containers would fall into the first. The
 * server refuses the same (remeasureAccept acceptByHandRefusal).
 */
export function acceptByHandReason(remeasuredCount: number, current: readonly CargoDimensionLine[]): string | null {
  if (remeasuredCount === current.length) return null;
  const containers = new Set(current.map((l) => l.containerId).filter(Boolean));
  return current.some(hasAdr) || containers.size > 1 ? ACCEPT_BY_HAND : null;
}

/**
 * What the shipment's lines keep through an acceptance, said as it will be: each takes the package
 * type, stackability, pallet type, container and dangerous goods of the line in its place; extra
 * lines those of the first line (only general cargo of one container gets there).
 */
export function keptText(remeasuredCount: number, current: readonly CargoDimensionLine[]): string {
  if (current.length === 0) return "Cargo Details has no lines to keep package type, stackability or dangerous goods from: set them on the new lines.";
  const kept = current.some(hasAdr) ? "package type, stackability, pallet type and dangerous goods" : "package type, stackability and pallet type";
  const each = `Each line keeps the ${kept} of the line in its place here`;
  if (remeasuredCount > current.length) return `${each}; the extra lines take those of the first line.`;
  if (remeasuredCount < current.length) return `${each}; the lines after line ${remeasuredCount} are removed.`;
  return `${each}.`;
}

/**
 * "Description lines still say 20 Cartons": the description lines (customs and invoice figures) are
 * never changed by an acceptance, so when their pieces differ from `pieces`, the screen says so;
 * null when they carry none or the same.
 */
export function descriptionNote(items: readonly CargoItemLine[], pieces: number): string | null {
  const described = items.reduce((s, i) => s + num(i.pieces), 0);
  if (!(described > 0) || !(pieces > 0) || described === pieces) return null;
  const kinds = [...new Set(items.filter((i) => num(i.pieces) > 0).map((i) => i.packageType.trim()).filter(Boolean))].join(", ");
  return `Description lines still say ${described.toLocaleString("en-US")}${kinds ? ` ${kinds}` : ""}`;
}

/** "5 colli · 250.0 kg · 34.650 CBM" */
export const figuresText = (f: CargoFigures) =>
  [
    `${f.colli > 0 ? f.colli : "—"} colli`,
    `${f.weightKg > 0 ? f.weightKg.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} kg`,
    `${f.volumeCbm > 0 ? f.volumeCbm.toFixed(3) : "—"} CBM`,
  ].join(" · ");
