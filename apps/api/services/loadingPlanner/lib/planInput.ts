import { BUSINESS_TZ } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import type { PlanCargoLine, PlanInput } from "../interfaces/interfaces";

// The limits of one plan. They keep a plan a browser can work out in a moment.
export const MAX_LINES = 200;
export const MAX_COLLI = 2000;
const MAX_SIZE_MM = 100_000;
const MAX_WEIGHT_KG = 1_000_000;

/** A plan as it is stored: cleaned, with nothing the user did not mean. */
export type CleanPlan = PlanInput;

const count = (n: number): string => n.toLocaleString("en-US");
const wholeIn = (value: number, max: number) => Number.isInteger(value) && value >= 1 && value <= max;

/** What is wrong with a cargo line, or null. `n` is its number in the list, for the message. */
function lineProblem(line: PlanCargoLine, n: number): string | null {
  const name = line.name.trim() || `line ${n}`;
  if (!line.id.trim() || line.id.length > 60) return `Cargo line ${n}: its id is missing`;
  if (line.name.length > 120) return `Cargo line ${n}: the name is longer than 120 characters`;
  for (const [label, value] of [["length", line.lengthMm], ["width", line.widthMm], ["height", line.heightMm]] as const) {
    if (!wholeIn(value, MAX_SIZE_MM)) return `Cargo "${name}": the ${label} must be between 1 mm and 100 m`;
  }
  if (!(line.weightKg > 0 && line.weightKg <= MAX_WEIGHT_KG)) return `Cargo "${name}": the weight must be more than 0 and at most 1,000 t`;
  if (!wholeIn(line.colli, MAX_COLLI)) return `Cargo "${name}": the colli must be a whole number from 1 to ${count(MAX_COLLI)}`;
  return null;
}

/**
 * Checks a plan a user sends and returns it cleaned, or the sentence that says what is wrong.
 * Pure, so the rules are unit-tested.
 */
export function cleanPlan(input: PlanInput): { plan: CleanPlan } | { problem: string } {
  const name = input.name.trim();
  if (!name) return { problem: "Give the plan a name before saving." };
  if (name.length > 120) return { problem: "The plan's name is longer than 120 characters" };

  if (input.lines.length > MAX_LINES) return { problem: `A plan holds at most ${MAX_LINES} cargo lines` };
  for (const [index, line] of input.lines.entries()) {
    const problem = lineProblem(line, index + 1);
    if (problem) return { problem };
  }
  if (new Set(input.lines.map((line) => line.id)).size !== input.lines.length) return { problem: "Two cargo lines have the same id" };
  const colli = input.lines.reduce((total, line) => total + line.colli, 0);
  if (colli > MAX_COLLI) return { problem: `A plan holds at most ${count(MAX_COLLI)} colli; this one has ${count(colli)}` };

  const linked = input.linkKind !== null;
  if (linked && !(input.linkId && isUuid(input.linkId))) return { problem: "The linked shipment or quote is missing" };
  const linkRef = input.linkRef.trim();
  if (linkRef.length > 60) return { problem: "The reference of the linked job is longer than 60 characters" };

  const nominated = input.nominated === null ? null : [...new Set(input.nominated)];
  if (nominated?.some((id) => !/^[0-9a-z]{2,10}$/.test(id)) || (nominated?.length ?? 0) > 30) return { problem: "The nominated equipment is not valid" };

  return {
    plan: {
      name,
      linkKind: input.linkKind,
      linkId: linked ? input.linkId : null,
      linkRef: linked ? linkRef : "",
      lines: input.lines.map((line) => ({
        id: line.id.trim(),
        name: line.name.trim(),
        lengthMm: line.lengthMm,
        widthMm: line.widthMm,
        heightMm: line.heightMm,
        weightKg: line.weightKg,
        colli: line.colli,
        canTurn: line.canTurn,
        stackable: line.stackable,
        // Kept only when sent: a line without the mark is stored without one.
        ...(line.dg === undefined ? {} : { dg: line.dg }),
      })),
      nominated,
    },
  };
}

/**
 * Whether a plan's link must be checked with the shipments or quotes service before it is saved:
 * a link on a new plan, and one that differs from the link the stored plan has. A link the plan
 * already has was checked when it was made - a job deleted since does not stop the plan from being
 * saved - and a plan without a link has nothing to check.
 */
export function linkNeedsCheck(sent: Pick<PlanInput, "linkKind" | "linkId">, stored: Pick<PlanInput, "linkKind" | "linkId"> | null): boolean {
  if (!sent.linkKind || !sent.linkId) return false;
  return !stored || sent.linkKind !== stored.linkKind || sent.linkId !== stored.linkId;
}

const savedAt = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** What a user is told whose save would overwrite somebody else's: who saved the plan meanwhile and when (Prague time). */
export function changedSinceMessage(updatedBy: string, updatedAt: Date): string {
  return `This plan was changed by ${updatedBy || "someone else"} on ${savedAt.format(updatedAt)} since you opened it. Reload it and save again.`;
}
