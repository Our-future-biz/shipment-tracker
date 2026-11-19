// Accepting the warehouse's remeasurement (owner decision, 18 Nov 2026): never by itself - a
// person who may change the shipment's details clicks "Accept remeasurement" on Cargo Details.
// The remeasured lines then replace the cargo dimension lines, and Pcs, Total Weight and Total
// Volume take their totals; the description lines (customs and invoice figures) stay. What the
// shipment held before is kept in its history (shipment_audit, field REMEASURE_ACCEPTED), so
// Cargo Details can say "Accepted by … on …" and Costs Breakdown can show the change. Pure.

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
  if (counted.length === 0) throw new Error("The warehouse has saved no remeasured lines with pieces: there is nothing to accept");
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

// A dimension line carries dangerous goods when it has any ADR detail.
const carriesAdr = (l: CargoDimensionLine) => !!(l.adrUn?.trim() || l.adrClass?.trim() || l.adrPackingGroup || l.adrLimitedQuantity);

export const ACCEPT_BY_HAND =
  "Dangerous goods or several containers are on these lines and the warehouse saved a different number of lines: update Cargo Details by hand";

/**
 * Why the remeasured lines can't replace the shipment's, or null when they can (council finding
 * X2): line n takes its container, packing and dangerous goods from the shipment's line n, so with
 * another number of lines a UN number would vanish or move to other cargo, and the lines of
 * several containers would fall into the first. Then a person updates Cargo Details. The web holds
 * the same rule (tabs/warehouse/remeasuredLines acceptByHandReason).
 */
export function acceptByHandRefusal(remeasuredCount: number, current: readonly CargoDimensionLine[]): string | null {
  if (remeasuredCount === current.length) return null;
  const containers = new Set(current.map((l) => l.containerId).filter(Boolean));
  return current.some(carriesAdr) || containers.size > 1 ? ACCEPT_BY_HAND : null;
}

/**
 * The cargo dimension lines the remeasured lines become. Line n keeps what the warehouse does not
 * measure - its container, package type, stackability, pallet type and dangerous goods - from the
 * shipment's line n, or from its first line when there are fewer (only without dangerous goods
 * and with one container at most: acceptByHandRefusal); the sizes are in cm.
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

/**
 * Pcs, Total Weight (tons) and Total Volume as the shipment stores them (4 decimals: tons to 0.1 kg),
 * from the lines' exact totals (exactFiguresOf), each rounded once - the weight to 0.1 kg, as it is
 * compared, and the volume to its 4th decimal rather than first to 0.001.
 */
export function acceptedTotals(f: AcceptedFigures): { pcs: string; totalWeightTons: string | null; totalVolumeCbm: string | null } {
  const tenthsKg = Math.round(f.weightKg * 10);
  const m3 = Math.round(f.volumeCbm * 10_000);
  return {
    pcs: f.colli > 0 ? String(f.colli) : "",
    totalWeightTons: tenthsKg > 0 ? (tenthsKg / 10_000).toFixed(4) : null,
    totalVolumeCbm: m3 > 0 ? (m3 / 10_000).toFixed(4) : null,
  };
}

// A container's figure as text: the exact total, to 6 decimals without trailing zeros.
const plain = (n: number) => (n > 0 ? String(Number(n.toFixed(6))) : "");

/**
 * The only container's Pieces, Gross Weight and Volume after an acceptance (council finding X3):
 * the screens read pieces, weight and volume from the container first (lib/cargoProjection), so a
 * container still declaring the old figures would keep them on Warehouse, Customs and the Pcs pill.
 * Exact totals, so the container agrees with its lines at the 2 and 3 decimals its pills compare.
 */
export function acceptedContainerFigures(f: AcceptedFigures): { packages: string; grossWeight: string; volume: string } {
  return { packages: f.colli > 0 ? String(f.colli) : "", grossWeight: plain(f.weightKg), volume: plain(f.volumeCbm) };
}

/** The lines an acceptance took over (its history entry's new value), "" when it names none. */
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

/** An acceptance whose containers or cargo lines were saved again before its write: decided on what is gone. */
export const CARGO_DETAILS_CHANGED = "Cargo Details changed meanwhile: look again and accept";

/**
 * Why the warehouse's saved lines (`saved`, `count` of them with pieces) can't be accepted over the
 * shipment's cargo dimension lines `current`, or null: the last acceptance (its history entry's new
 * value, `lastAccepted`) already took the same lines over (council finding m8 - a second one would
 * bring back a Costs warning already checked), or the lines must be updated by hand
 * (acceptByHandRefusal). Asked before the write and again in its write turn, on the lines and the
 * history as they are then, so two Accepts at once record one acceptance.
 */
export function acceptRefusal(saved: string, count: number, lastAccepted: string | null | undefined, current: readonly CargoDimensionLine[]): string | null {
  if (alreadyAccepted(saved, lastAccepted)) return ALREADY_ACCEPTED;
  return acceptByHandRefusal(count, current);
}

/** Whether the last acceptance (its history entry's new value; null for none) took over the lines `saved`. */
export const alreadyAccepted = (saved: string, lastAccepted: string | null | undefined): boolean =>
  lastAccepted != null && sameRemeasuredLines(acceptedLinesOf(lastAccepted), saved);

/** The containers and cargo dimension lines an acceptance is decided on, as Cargo Details shows them. */
export interface CargoDetailsRead {
  containers: readonly ContainerLine[];
  lines: readonly CargoDimensionLine[];
}

// A value as text with its keys in order, so two reads of the same rows compare equal however
// their objects were built.
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v ?? null);

/**
 * Whether the containers and cargo dimension lines are still as the acceptance read them - the same
 * containers with the same figures and seals, the same lines in the same order: the accepted lines
 * take their container, packing and dangerous goods from them, and the only container its figures.
 * A save of Cargo Details in between (a container added, a seal changed, an ADR line added) makes
 * the acceptance be looked at again rather than undo it.
 */
export const sameCargoDetails = (a: CargoDetailsRead, b: CargoDetailsRead): boolean =>
  canonical({ containers: a.containers, lines: a.lines }) === canonical({ containers: b.containers, lines: b.lines });

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
