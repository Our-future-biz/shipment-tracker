// Accepting the warehouse's remeasurement (owner decision, 18 Nov 2026): never by itself - a
// person who may change the shipment's details clicks "Accept remeasurement" on Cargo Details.
// Since 22 Nov (owner's answer) the acceptance is only recorded: Cargo Details' lines, the
// shipment's Colli, Total Weight and Total Volume and its container stay as they are. The figures
// before and after are kept in its history (shipment_audit, field REMEASURE_ACCEPTED), so the
// Remeasured by Warehouse tile can say "Accepted by … on …", and Alerts, Shipments → Managers and
// Costs Breakdown take it as before. Pure.

import { cargoNum, dimensionVolumePerPiece } from "../../../lib/cargoVolume";
import type { CargoDimensionLine, ContainerLine } from "../interfaces/interfaces";

/** The history entry of an acceptance: old value = the figures before, new value = after. */
export const REMEASURE_ACCEPTED = "remeasurementAccepted";
/** The history entry of "Quantities checked" on Costs Breakdown after an acceptance. */
export const REMEASURE_COSTS_CHECKED = "remeasurementCostsChecked";

export interface AcceptedFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

/** One remeasured line as the warehouse saves it: numbers as text, sizes in cm. */
export interface RemeasuredLine {
  pieces: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightPerPcKg: string;
}

const FIELDS = ["pieces", "lengthCm", "widthCm", "heightCm", "weightPerPcKg"] as const;
const LABELS: Record<(typeof FIELDS)[number], string> = { pieces: "Qty", lengthCm: "length", widthCm: "width", heightCm: "height", weightPerPcKg: "kg per piece" };
/** What the warehouse must have measured on every line with pieces before it can be accepted. */
const MEASURED = ["weightPerPcKg", "lengthCm", "widthCm", "heightCm"] as const;

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/**
 * A plain number as the warehouse may type it: digits with one decimal point, also a point it
 * starts or ends with ("120.", ".5") - the Warehouse tab's field lets one stand while typing. The
 * web reads the lines by the same rule (tabs/warehouse/remeasuredLines), so Accept never looks
 * ready for a line the server refuses.
 */
export const PLAIN_NUMBER = /^(\d+(\.\d*)?|\.\d+)$/;

/** "120." is 120 and ".5" is 0.5, as the cargo lines store them. */
export const tidyNumber = (t: string): string => (t.startsWith(".") ? `0${t}` : t.endsWith(".") ? t.slice(0, -1) : t);

/** "length", "length or width", "length, width or height". */
const orList = (words: readonly string[]) => (words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`);

/**
 * Why a remeasured line with pieces can't be accepted, or null: it lacks its kg per piece or one
 * of its sizes (empty or 0): only a remeasurement measured in full is accepted (kept on 22 Nov, when
 * Accept became a record only). `line`: its number in the warehouse's list. The web holds the same rule
 * (apps/web/src/app/shipments/[jobNumber]/tabs/warehouse/remeasuredLines.ts).
 */
export function unmeasuredProblem(l: RemeasuredLine, line: number): string | null {
  const missing = MEASURED.filter((f) => !(cargoNum(l[f]) > 0)).map((f) => LABELS[f]);
  if (missing.length === 0) return null;
  return `Remeasured line ${line} has no ${orList(missing)}: the warehouse must measure weight and sizes of every line before it can be accepted`;
}

/**
 * The warehouse's saved lines (its `remeasure_rows` text), each checked: whole pieces above 0 and
 * plain numbers (a decimal comma read as a point, a point at either end tidied away), and every
 * line with pieces measured in full - kg per piece, length, width and height. Throws a message
 * naming the line otherwise, and when there is no line with pieces - nothing to accept.
 */
export function parseRemeasuredLines(raw: string): RemeasuredLine[] {
  let list: unknown;
  try {
    list = JSON.parse(raw || "[]");
  } catch {
    throw new Error("The remeasured lines cannot be read");
  }
  if (!Array.isArray(list)) throw new Error("The remeasured lines cannot be read");
  const lines = list.map((r, i): RemeasuredLine => {
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error(`Remeasured line ${i + 1} cannot be read`);
    const o = r as Record<string, unknown>;
    const line = Object.fromEntries(
      FIELDS.map((f) => {
        const t = (typeof o[f] === "number" ? String(o[f]) : typeof o[f] === "string" ? (o[f] as string) : "").trim().replace(",", ".");
        if (t && !PLAIN_NUMBER.test(t)) throw new Error(`Remeasured line ${i + 1}: ${LABELS[f]} is not a number`);
        return [f, tidyNumber(t)];
      }),
    ) as unknown as RemeasuredLine;
    if (line.pieces && !Number.isInteger(Number(line.pieces))) throw new Error(`Remeasured line ${i + 1}: Qty must be a whole number`);
    return line;
  });
  const counted = lines.map((l, i) => ({ l, line: i + 1 })).filter(({ l }) => cargoNum(l.pieces) > 0);
  if (counted.length === 0) throw new Error("The warehouse has saved no remeasured lines with colli: there is nothing to accept");
  for (const { l, line } of counted) {
    const problem = unmeasuredProblem(l, line);
    if (problem) throw new Error(problem);
  }
  return counted.map(({ l }) => l);
}

type FigureLine = RemeasuredLine & { volumePerPcM3?: string | null };

/** Pieces, kg and m³ of cargo dimension lines or remeasured lines, not rounded. */
export function exactFiguresOf(lines: readonly FigureLine[]): AcceptedFigures {
  let colli = 0;
  let kg = 0;
  let m3 = 0;
  for (const l of lines) {
    const pieces = cargoNum(l.pieces);
    colli += pieces;
    kg += pieces * cargoNum(l.weightPerPcKg);
    m3 += pieces * dimensionVolumePerPiece({ ...l, volumePerPcM3: l.volumePerPcM3 ?? "" });
  }
  return { colli, weightKg: kg, volumeCbm: m3 };
}

/**
 * Figures rounded as they are compared and shown everywhere - kg to 0.1, m³ to 0.001 - on both
 * sides alike, so lines of 7 × 13.25 kg (92.75) and a Total Weight of 92.8 kg are the same weight.
 */
export const roundedFigures = (f: AcceptedFigures): AcceptedFigures => ({ colli: f.colli, weightKg: round(f.weightKg, 1), volumeCbm: round(f.volumeCbm, 3) });

/** Pieces, kg (0.1) and m³ (0.001) of cargo dimension lines or remeasured lines. */
export const figuresOf = (lines: readonly FigureLine[]): AcceptedFigures => roundedFigures(exactFiguresOf(lines));

/** The lines an acceptance accepted (its history entry's new value), "" when it names none. */
export function acceptedLinesOf(value: string | null | undefined): string {
  try {
    const o = JSON.parse(value ?? "") as { lines?: unknown } | null;
    return o && typeof o.lines === "string" ? o.lines : "";
  } catch {
    return "";
  }
}

/**
 * Whether two saved texts hold the same remeasured lines (council finding m8: the same lines are
 * not accepted twice) - also when saved with other spacing, key order or a point tidied away.
 */
export function sameRemeasuredLines(a: string, b: string): boolean {
  if (a === b) return true;
  const read = (t: string) => {
    try {
      return parseRemeasuredLines(t);
    } catch {
      return null;
    }
  };
  const [x, y] = [read(a), read(b)];
  return !!x && !!y && JSON.stringify(x) === JSON.stringify(y);
}

export const ALREADY_ACCEPTED = "These remeasured lines were already accepted: the warehouse has saved nothing new since";

/**
 * Whether the last acceptance (its history entry's new value; null for none) accepted the lines
 * `saved` (council finding m8: the same lines are not accepted twice - a second acceptance would
 * bring back a Costs note already checked). Asked before the write and again in its write turn, so
 * two Accepts at once record one acceptance.
 */
export const alreadyAccepted = (saved: string, lastAccepted: string | null | undefined): boolean =>
  lastAccepted != null && sameRemeasuredLines(acceptedLinesOf(lastAccepted), saved);

/** The containers and cargo dimension lines as Cargo Details shows them (shipment.service cargoDetailsOf). */
export interface CargoDetailsRead {
  containers: readonly ContainerLine[];
  lines: readonly CargoDimensionLine[];
}

/** The figures a history entry of an acceptance holds (its old or new value); zeros when unreadable. */
export function readFigures(value: string | null | undefined): AcceptedFigures {
  try {
    const o = JSON.parse(value ?? "") as Partial<AcceptedFigures>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
    return { colli: n(o.colli), weightKg: n(o.weightKg), volumeCbm: n(o.volumeCbm) };
  } catch {
    return { colli: 0, weightKg: 0, volumeCbm: 0 };
  }
}
