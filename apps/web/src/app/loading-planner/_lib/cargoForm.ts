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
}

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
  return { id: line.id, name: line.name.trim(), lengthMm, widthMm, heightMm, weightKg, colli, canTurn: line.canTurn, stackable: line.stackable };
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
