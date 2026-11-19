// Accepting the warehouse's remeasurement (owner decision, 18 Nov 2026): never by itself - a
// person who may change the shipment's details clicks "Accept remeasurement" on Cargo Details.
// The remeasured lines then replace the cargo dimension lines, and Pcs, Total Weight and Total
// Volume take their totals; the description lines (customs and invoice figures) stay. What the
// shipment held before is kept in its history (shipment_audit, field REMEASURE_ACCEPTED), so
// Cargo Details can say "Accepted by … on …" and Costs Breakdown can show the change. Pure.

import { cargoNum, dimensionVolumePerPiece } from "../../../lib/cargoVolume";
import type { CargoDimensionLine } from "../interfaces/interfaces";

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

/** "length", "length or width", "length, width or height". */
const orList = (words: readonly string[]) => (words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`);

/**
 * Why a remeasured line with pieces can't be accepted, or null: it lacks its kg per piece or one
 * of its sizes (empty or 0). Accepted, such a line would write an empty weight or volume over the
 * shipment's. `line`: its number in the warehouse's list. The web holds the same rule
 * (apps/web/src/app/shipments/[jobNumber]/tabs/warehouse/remeasuredLines.ts).
 */
export function unmeasuredProblem(l: RemeasuredLine, line: number): string | null {
  const missing = MEASURED.filter((f) => !(cargoNum(l[f]) > 0)).map((f) => LABELS[f]);
  if (missing.length === 0) return null;
  return `Remeasured line ${line} has no ${orList(missing)}: the warehouse must measure weight and sizes of every line before it can be accepted`;
}

/**
 * The warehouse's saved lines (its `remeasure_rows` text), each checked: whole pieces above 0 and
 * plain numbers (a decimal comma read as a point), and every line with pieces measured in full -
 * kg per piece, length, width and height. Throws a message naming the line otherwise, and when
 * there is no line with pieces - nothing to accept.
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
        if (t && !/^\d+(\.\d+)?$/.test(t)) throw new Error(`Remeasured line ${i + 1}: ${LABELS[f]} is not a number`);
        return [f, t];
      }),
    ) as unknown as RemeasuredLine;
    if (line.pieces && !Number.isInteger(Number(line.pieces))) throw new Error(`Remeasured line ${i + 1}: Qty must be a whole number`);
    return line;
  });
  const counted = lines.map((l, i) => ({ l, line: i + 1 })).filter(({ l }) => cargoNum(l.pieces) > 0);
  if (counted.length === 0) throw new Error("The warehouse has saved no remeasured lines with pieces: there is nothing to accept");
  for (const { l, line } of counted) {
    const problem = unmeasuredProblem(l, line);
    if (problem) throw new Error(problem);
  }
  return counted.map(({ l }) => l);
}

/** Pieces, kg (0.1) and m³ (0.001) of cargo dimension lines or remeasured lines. */
export function figuresOf(lines: readonly (RemeasuredLine & { volumePerPcM3?: string | null })[]): AcceptedFigures {
  let colli = 0;
  let kg = 0;
  let m3 = 0;
  for (const l of lines) {
    const pieces = cargoNum(l.pieces);
    colli += pieces;
    kg += pieces * cargoNum(l.weightPerPcKg);
    m3 += pieces * dimensionVolumePerPiece({ ...l, volumePerPcM3: l.volumePerPcM3 ?? "" });
  }
  return { colli, weightKg: round(kg, 1), volumeCbm: round(m3, 3) };
}

/**
 * The cargo dimension lines the remeasured lines become. Line n keeps what the warehouse does not
 * measure - its container, package type, stackability, pallet type and dangerous goods - from the
 * shipment's line n, or from its first line when there are fewer; the sizes are in cm.
 */
export function acceptedDimensionLines(remeasured: readonly RemeasuredLine[], current: readonly CargoDimensionLine[]): CargoDimensionLine[] {
  return remeasured.map((r, i) => {
    const from = current[i] ?? current[0];
    return {
      containerId: from?.containerId ?? null,
      packageType: from?.packageType ?? "",
      stackable: from?.stackable ?? "",
      palletType: from?.palletType ?? null,
      adrUn: from?.adrUn ?? null,
      adrClass: from?.adrClass ?? null,
      adrPackingGroup: from?.adrPackingGroup ?? null,
      adrLimitedQuantity: from?.adrLimitedQuantity ?? false,
      pieces: r.pieces,
      lengthCm: r.lengthCm,
      widthCm: r.widthCm,
      heightCm: r.heightCm,
      dimensionUnit: "cm",
      weightPerPcKg: r.weightPerPcKg,
      volumePerPcM3: "",
    };
  });
}

/** Pcs, Total Weight (tons) and Total Volume as the shipment stores them, from the accepted figures. */
export function acceptedTotals(f: AcceptedFigures): { pcs: string; totalWeightTons: string | null; totalVolumeCbm: string | null } {
  return {
    pcs: f.colli > 0 ? String(f.colli) : "",
    totalWeightTons: f.weightKg > 0 ? (f.weightKg / 1000).toFixed(4) : null,
    totalVolumeCbm: f.volumeCbm > 0 ? f.volumeCbm.toFixed(4) : null,
  };
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
