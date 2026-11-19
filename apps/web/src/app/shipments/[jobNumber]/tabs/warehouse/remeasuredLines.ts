import { num } from "@/lib/cargo";
import type { CargoFigures } from "./RemeasureCompare";

// The warehouse's saved remeasured lines (its job section's remeasure_rows: a JSON list of
// { pieces, lengthCm, widthCm, heightCm, weightPerPcKg }, numbers as text), as Cargo Details shows
// them. Pure.

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

const MEASURED: [keyof RemeasuredLine, string][] = [
  ["weightPerPcKg", "kg per piece"],
  ["lengthCm", "length"],
  ["widthCm", "width"],
  ["heightCm", "height"],
];

/** "length", "length or width", "length, width or height". */
const orList = (words: string[]) => (words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`);

/**
 * Why the warehouse's saved lines can't be accepted yet, or null: a line with pieces lacks its kg
 * per piece or one of its sizes (empty or 0), which would write an empty weight or volume over the
 * shipment's. The line is numbered as in the warehouse's list. The API refuses the same, in the
 * same words (services/shipments/lib/remeasureAccept).
 */
export function unmeasuredReason(json: string | undefined): string | null {
  let arr: unknown;
  try {
    arr = JSON.parse(json || "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  for (const [i, r] of arr.entries()) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    const t = (k: string) => (typeof o[k] === "string" || typeof o[k] === "number" ? String(o[k]).trim() : "");
    if (num(t("pieces")) <= 0) continue;
    const missing = MEASURED.filter(([k]) => !(num(t(k)) > 0)).map(([, label]) => label);
    if (missing.length) return `Remeasured line ${i + 1} has no ${orList(missing)}: the warehouse must measure weight and sizes of every line before it can be accepted`;
  }
  return null;
}

export const lineCbm = (l: RemeasuredLine) => (num(l.pieces) * num(l.lengthCm) * num(l.widthCm) * num(l.heightCm)) / 1_000_000;

export function remeasuredFigures(lines: RemeasuredLine[]): CargoFigures {
  const colli = lines.reduce((s, l) => s + num(l.pieces), 0);
  const kg = lines.reduce((s, l) => s + num(l.pieces) * num(l.weightPerPcKg), 0);
  const cbm = lines.reduce((s, l) => s + lineCbm(l), 0);
  return { colli, weightKg: Math.round(kg * 10) / 10, volumeCbm: Math.round(cbm * 1000) / 1000 };
}

/** "5 colli · 250.0 kg · 34.650 CBM" */
export const figuresText = (f: CargoFigures) =>
  [
    `${f.colli > 0 ? f.colli : "—"} colli`,
    `${f.weightKg > 0 ? f.weightKg.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} kg`,
    `${f.volumeCbm > 0 ? f.volumeCbm.toFixed(3) : "—"} CBM`,
  ].join(" · ");

