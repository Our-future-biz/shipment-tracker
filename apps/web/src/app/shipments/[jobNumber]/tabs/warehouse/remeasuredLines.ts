import { dimensionTotals, dimensionVolumePerPiece, hasAdr, num, roundFigure, shipmentDeclaredFigures, type CargoDimensionLine, type CargoItemLine } from "@/lib/cargo";
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

/** The lines the last acceptance took over, again: the server refuses them in these words. */
export const ALREADY_ACCEPTED = "These remeasured lines were already accepted: the warehouse has saved nothing new since";

export const ACCEPT_BY_HAND =
  "Dangerous goods or several containers are on these lines and the warehouse's lines don't match them line for line (the same number of lines, the same pieces on each, no two lines of other cargo with the same pieces): update Cargo Details by hand";

// What a line hands on to the remeasured line in its place: its container, packing and dangerous goods.
const handedOn = (l: CargoDimensionLine) =>
  JSON.stringify([l.containerId ?? null, l.packageType ?? "", l.stackable ?? "", l.palletType ?? null, l.adrUn ?? null, l.adrClass ?? null, l.adrPackingGroup ?? null, !!l.adrLimitedQuantity]);

/**
 * Why the remeasured lines can't replace the shipment's, or null: line n keeps its container,
 * packing and dangerous goods from the shipment's line n. With dangerous goods or several
 * containers on the lines that is only right when line n is the same cargo - the same number of
 * lines, the same pieces on each (mock test council Y8: 3 drums UN 1203 and 10 cartons, saved by
 * the warehouse cartons first, would make the cartons "Drums UN 1203") - and the pieces tell the
 * lines apart: no two lines of other cargo carry the same (review: 1 drum pallet UN 1203 and 1
 * carton pallet, saved carton pallet first). Lines that hand on the same may swap. The server
 * refuses the same (remeasureAccept acceptByHandRefusal).
 */
export function acceptByHandReason(remeasured: readonly { pieces: string }[], current: readonly CargoDimensionLine[]): string | null {
  const containers = new Set(current.map((l) => l.containerId).filter(Boolean));
  if (!current.some(hasAdr) && containers.size < 2) return null;
  const lineForLine = remeasured.length === current.length && remeasured.every((r, i) => num(r.pieces) === num(current[i]!.pieces));
  const toldApart = current.every((l, i) => current.every((m, j) => j <= i || num(l.pieces) !== num(m.pieces) || handedOn(l) === handedOn(m)));
  return lineForLine && toldApart ? null : ACCEPT_BY_HAND;
}

const MEASURED_FIELDS = ["pieces", "lengthCm", "widthCm", "heightCm", "weightPerPcKg"] as const;

/**
 * Whether Cargo Details' lines still hold the remeasured lines - line for line the same pieces,
 * sizes (cm) and kg per piece, as an acceptance wrote them (the server's holdsRemeasuredLines).
 */
export const holdsRemeasuredLines = (current: readonly CargoDimensionLine[], remeasured: readonly RemeasuredLine[]): boolean =>
  current.length === remeasured.length && remeasured.every((r, i) => MEASURED_FIELDS.every((f) => Math.abs(num(current[i]![f]) - num(r[f])) < 0.001));

/**
 * Whether the last acceptance took over the warehouse's saved lines and Cargo Details still hold
 * them (mock test council Y10): then Accept is refused as ALREADY_ACCEPTED. Lines saved over since -
 * by hand, or by a page opened before the acceptance - may be accepted again, as the server lets them.
 */
export const alreadyAccepted = (acceptedLines: string | null | undefined, saved: string, current: readonly CargoDimensionLine[]): boolean =>
  acceptedLines != null && sameRemeasuredLines(acceptedLines, saved) && holdsRemeasuredLines(current, readRemeasuredLines(saved));

/**
 * What each of the lines takes over from Cargo Details, said per line (Y8): "line 1 Drums, UN 1203,
 * container MSKU1234567; line 2 Cartons". Extra lines take the first line's; with no lines here
 * there is nothing to take over (null). `containers`: the shipment's, for their numbers.
 */
export function takenOverText(
  remeasuredCount: number,
  current: readonly CargoDimensionLine[],
  containers: readonly { id?: string | null; containerNumber?: string | null }[],
): string | null {
  if (current.length === 0 || remeasuredCount === 0) return null;
  const parts = Array.from({ length: remeasuredCount }, (_, i) => {
    const from = current[i] ?? current[0]!;
    const number = from.containerId ? (containers.find((c) => c.id === from.containerId)?.containerNumber ?? "").trim() : "";
    const un = (from.adrUn ?? "").trim().replace(/^UN\s*/i, "");
    const what = [from.packageType.trim() || "no package type", un && `UN ${un}`, number && `container ${number}`].filter(Boolean).join(", ");
    return `line ${i + 1} ${what}`;
  });
  return `Taken over: ${parts.join("; ")}.`;
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

/**
 * What the confirm says Pcs becomes (mock test council n15, owner's answer C3: the job keeps showing
 * the description lines' pieces). With no container the job's Pcs is read from its description
 * lines first, so when they carry pieces it stays what they say whatever is accepted - said plainly
 * rather than "Pcs become 18" while the job keeps showing 20. With a container, or no described
 * pieces, Pcs follows the accepted lines.
 */
export function pcsAfterText(items: readonly CargoItemLine[], containerCount: number, pieces: number): string {
  const described = items.reduce((s, i) => s + num(i.pieces), 0);
  if (containerCount > 0 || !(described > 0) || described === pieces) return `Pcs becomes ${pieces > 0 ? pieces.toLocaleString("en-US") : "—"}`;
  return `the job's Pcs stays ${described.toLocaleString("en-US")}: with no container it follows the description lines`;
}

/** "5 colli · 250.0 kg · 34.650 CBM" */
export const figuresText = (f: CargoFigures) =>
  [
    `${f.colli > 0 ? f.colli : "—"} colli`,
    `${f.weightKg > 0 ? f.weightKg.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} kg`,
    `${f.volumeCbm > 0 ? f.volumeCbm.toFixed(3) : "—"} CBM`,
  ].join(" · ");
