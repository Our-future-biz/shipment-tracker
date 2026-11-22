import { dimensionTotals, dimensionVolumePerPiece, num, roundFigure, shipmentDeclaredFigures, type CargoDimensionLine } from "@/lib/cargo";
import { figuresCompared, figuresDiffer, type CargoFigures } from "./RemeasureCompare";

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
 * sizes (empty or 0): only a remeasurement measured in full is accepted (kept on 22 Nov, when Accept
 * became a record only). The line is numbered as in the warehouse's list. The API refuses the same, in the same words
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
 * or a point tidied away: the lines an acceptance accepted are not accepted again.
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
export const roundedFigures = (f: CargoFigures): CargoFigures => ({ colli: f.colli, weightKg: roundFigure(f.weightKg, 1), volumeCbm: roundFigure(f.volumeCbm, 3) });

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
 * Weight and Total Volume, rounded as the remeasured figures are. Lacked by any line with pieces,
 * not only by all, the typed figure is the cargo's while one is typed: 1 × 600 kg and 1 piece
 * unweighed are not 600 kg of cargo when Total Weight says 1.2 t.
 */
export function shipmentCargoFigures(s: { cargoDimensions?: CargoDimensionLine[] | null; pcs?: string | null; totalWeightTons?: string | null; totalVolumeCbm?: string | null }): CargoFigures {
  const lines = s.cargoDimensions ?? [];
  const t = dimensionTotals(lines);
  const typed = shipmentDeclaredFigures(s);
  const lacks = (perPiece: (l: CargoDimensionLine) => number) => lines.some((l) => num(l.pieces) > 0 && !(perPiece(l) > 0));
  const filled = (fromLines: number, fromTyped: number, perPiece: (l: CargoDimensionLine) => number) => (fromTyped > 0 && lacks(perPiece) ? fromTyped : fromLines || fromTyped);
  return roundedFigures({
    colli: t.pcs || num(typed.packages),
    weightKg: filled(t.kg, num(typed.grossWeight), (l) => num(l.weightPerPcKg)),
    volumeCbm: filled(t.m3, num(typed.volume), dimensionVolumePerPiece),
  });
}

/** The lines the last acceptance accepted, again: the server refuses them in these words. */
export const ALREADY_ACCEPTED = "These remeasured lines were already accepted: the warehouse has saved nothing new since";

/**
 * Whether the last acceptance (its lines; null for none) accepted the warehouse's saved lines: Accept is
 * refused as ALREADY_ACCEPTED until the warehouse saves other lines. An acceptance is only recorded (owner's
 * answer 22 Nov) - Cargo Details is never changed by it - so the lines alone decide, as the server's.
 */
export const alreadyAccepted = (acceptedLines: string | null | undefined, saved: string): boolean =>
  acceptedLines != null && sameRemeasuredLines(acceptedLines, saved);

/** What the Warehouse tab says under its Compared table (remeasureBar). */
export type RemeasureBar = "differs" | "accepted" | "matches" | null;

/**
 * What the Warehouse tab says under its Compared table: "differs", with Inform Operations, while the
 * remeasured figures differ from the shipment's (a figure only the warehouse measured too);
 * "accepted" in its place when the lines saved are the ones last accepted (review of system-23:
 * Accept only records, so the figures still differ after it - the tab offered Inform Again as if
 * nothing was done, and Accept refuses those lines as accepted already); "matches"; null while
 * nothing was remeasured or no figure is known on both sides. `unsaved`: lines on screen not saved
 * yet - those are not the lines accepted.
 */
export function remeasureBar(o: { ship: CargoFigures; re: CargoFigures; saved: string; unsaved: boolean; acceptedLines: string | null | undefined }): RemeasureBar {
  const { ship, re } = o;
  if (!(re.colli > 0 || re.weightKg > 0 || re.volumeCbm > 0)) return null;
  if (figuresDiffer(ship, re)) return !o.unsaved && alreadyAccepted(o.acceptedLines, o.saved) ? "accepted" : "differs";
  return figuresCompared(ship, re) ? "matches" : null;
}

/** "5 colli · 250.0 kg · 34.650 CBM" */
export const figuresText = (f: CargoFigures) =>
  [
    `${f.colli > 0 ? f.colli : "—"} colli`,
    `${f.weightKg > 0 ? f.weightKg.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} kg`,
    `${f.volumeCbm > 0 ? f.volumeCbm.toFixed(3) : "—"} CBM`,
  ].join(" · ");
