import type { interfaces } from "@/lib/api/client";
import type { CargoLine } from "./gauge";

/** A cargo line while it is being typed: a figure not typed yet is null. Sizes in mm. */
export interface DraftLine {
  id: string;
  name: string;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weightKg: number | null;
  colli: number | null;
  canTurn: boolean;
  stackable: boolean;
  /** Dangerous goods, as the job the line came from says. */
  dg?: boolean;
  /** The shipment the line belongs to in a plan of a sailing's box: its job number. */
  group?: string;
}

/** The most a plan holds; the server refuses more. */
export const MAX_LINES = 200;
export const MAX_COLLI = 2000;

export const newDraftLine = (id: string): DraftLine => ({
  id,
  name: "",
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  weightKg: null,
  colli: 1,
  canTurn: true,
  stackable: false,
});

/** A line nothing was typed into yet: it is neither planned nor saved, and nobody is asked to finish it. */
export const isBlank = (line: DraftLine): boolean =>
  !line.name.trim() && line.lengthMm === null && line.widthMm === null && line.heightMm === null && line.weightKg === null;

const positive = (value: number | null): value is number => value !== null && value > 0;

/** The line as the planner and the API take it, or null while a figure is missing. */
export function completeLine(line: DraftLine): CargoLine | null {
  const { lengthMm, widthMm, heightMm, weightKg, colli } = line;
  if (!positive(lengthMm) || !positive(widthMm) || !positive(heightMm) || !positive(weightKg) || !positive(colli)) return null;
  return { id: line.id, name: line.name.trim(), lengthMm, widthMm, heightMm, weightKg, colli, canTurn: line.canTurn, stackable: line.stackable, ...(line.dg ? { dg: true } : {}), ...(line.group ? { group: line.group } : {}) };
}

/** The figures a typed line still lacks, in the cargo table's words; none for a complete or a blank line. */
export function missingFigures(line: DraftLine): string[] {
  if (isBlank(line)) return [];
  const figures: [string, number | null][] = [["length", line.lengthMm], ["width", line.widthMm], ["height", line.heightMm], ["weight", line.weightKg], ["colli", line.colli]];
  return figures.filter(([, value]) => !positive(value)).map(([label]) => label);
}

/** How many typed lines are not planned yet, because a figure is missing. */
export const unplannedCount = (drafts: DraftLine[]): number => drafts.filter((draft) => missingFigures(draft).length > 0).length;

/** Why this cargo is too much for one plan, or null. Checked before planning, so the page never works on it. */
export function limitProblem(cargo: CargoLine[]): string | null {
  const colli = cargo.reduce((total, line) => total + line.colli, 0);
  if (cargo.length > MAX_LINES) return `A plan holds at most ${MAX_LINES} cargo lines; this one has ${cargo.length}. Split the cargo over several plans.`;
  if (colli > MAX_COLLI) {
    return `A plan holds at most ${MAX_COLLI.toLocaleString("en-US")} colli; this cargo has ${colli.toLocaleString("en-US")}. Plan it by pallet, or split it over several plans.`;
  }
  return null;
}

/** The job a plan is linked to. */
export interface JobLink {
  kind: interfaces.PlanLinkKind;
  id: string;
  ref: string;
}

/**
 * What of a plan is saved, as one string: two of them differ exactly when there is something to
 * save. The fields are written out in a fixed order with trimmed names, because the server returns
 * a line's fields in its own order and trims its name. A line's id is left out: the same cargo
 * taken from the job again is no change.
 */
export function planFingerprint(name: string, drafts: DraftLine[], nominated: string[] | null, link: JobLink | null): string {
  const lines = drafts
    .filter((line) => !isBlank(line))
    .map((l) => [l.name.trim(), l.lengthMm, l.widthMm, l.heightMm, l.weightKg, l.colli, l.canTurn, l.stackable, l.dg === true, l.group ?? ""]);
  return JSON.stringify([name.trim(), lines, nominated, link?.kind ?? null, link?.id ?? null]);
}

/** The lines the plan is worked out from: the complete ones. */
export const cargoLinesOf = (drafts: DraftLine[]): CargoLine[] => drafts.flatMap((draft) => completeLine(draft) ?? []);

/** The name a line goes by on screen: its own, or its number in the list. */
export const lineLabel = (line: { name: string }, index: number): string => line.name.trim() || `Line ${index + 1}`;

/** Why the plan cannot be saved as it stands, or null. Blank lines are simply left out. */
export function saveProblem(name: string, drafts: DraftLine[]): string | null {
  if (!name.trim()) return "Give the plan a name before saving.";
  const typed = drafts.filter((draft) => !isBlank(draft));
  const unfinished = typed.findIndex((draft) => completeLine(draft) === null);
  if (unfinished >= 0) return `"${lineLabel(typed[unfinished] ?? { name: "" }, unfinished)}" is not complete: fill in its length, width, height, weight and colli.`;
  return null;
}

export const draftsOf = (lines: interfaces.PlanCargoLine[]): DraftLine[] => lines.map((line) => ({ ...line }));

/** The number a cargo line goes by on every drawing and table: its row in the cargo table, from 1. */
export const lineNumbers = (drafts: { id: string }[]): Map<string, number> => new Map(drafts.map((draft, index) => [draft.id, index + 1]));
