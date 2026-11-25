import { CONTAINER_TYPES } from "@/lib/cargo";
import { isOogType } from "@/lib/oogGauge";
import { gaugeJudgementOf, isOog, worstJudgement, type CargoMeasures, type GaugeJudgement } from "./loadStats";
import type { LoadPlan } from "./plan";

// "Put the plan on the quote" (Council Outlay 14, P7, D20): a plan's equipment as a Sea FCL quote's
// container lines, and its cargo's measures as the quote's out-of-gauge block - offered, shown old
// against new, and written only when the user confirms. A plan never changes its quote by itself.

/** A quote's container line and its out-of-gauge block, as the quote keeps them. */
export interface QuoteBox {
  qty: number;
  type: string;
  /** Cargo weight per container, in kg. */
  weight?: number;
}
export interface QuoteGauge {
  inGauge?: boolean;
  length?: number;
  width?: number;
  height?: number;
}

export interface PlanForQuote {
  /** One line per container type of the plan, in the plan's order; the cargo weight per container is the type's average. */
  containers: QuoteBox[];
  /** The out-of-gauge block of the plan's open tops or flat racks (see `gaugeBlock`); null when it has none, or more than one type of them. */
  oog: Required<QuoteGauge> | null;
  /**
   * The open-top and flat-rack types of the plan, in its order. A quote has one out-of-gauge block,
   * judged against each such type it carries: it can describe the cargo of one type, so a plan with
   * two or more writes none.
   */
  gaugeTypes: string[];
  /** Types of the plan a quote's container list does not hold (a 20' high cube, a hard-top). */
  unknown: string[];
  /** Colli the plan found no place for. */
  notLoaded: number;
}

export function planForQuote(plan: LoadPlan): PlanForQuote {
  const byType = new Map<string, { qty: number; weightKg: number }>();
  for (const load of plan.loads) {
    const entry = byType.get(load.container.name) ?? { qty: 0, weightKg: 0 };
    byType.set(load.container.name, { qty: entry.qty + 1, weightKg: entry.weightKg + load.totalWeightKg });
  }
  const special = plan.loads.filter((load) => isOogType(load.container.name));
  const gaugeTypes = [...new Set(special.map((load) => load.container.name))];
  const judgements = special.flatMap((load) => gaugeJudgementOf(load) ?? []);
  return {
    containers: [...byType].map(([type, { qty, weightKg }]) => ({ qty, type, weight: Math.round(weightKg / qty) })),
    oog: gaugeTypes.length === 1 ? gaugeBlock(judgements, special[0]!.container.group === "flat-rack") : null,
    gaugeTypes,
    unknown: [...byType.keys()].filter((type) => !CONTAINER_TYPES.includes(type)),
    notLoaded: plan.notLoaded.reduce((sum, entry) => sum + entry.colli, 0),
  };
}

/**
 * The out-of-gauge block of the containers of one type, from the table's verdict on each, so that
 * the quote's check of the block gives the verdict the plan gives. On flat racks the largest
 * measures over them: a measure is out of gauge only past its limit, so the largest is out where any
 * container's is. On open tops the measures of the piece that stands for the worst of them: an open
 * top is loaded piece by piece, and measures of different pieces taken together would be cargo that
 * goes on none. In gauge unless the table calls a container out of gauge; the liner's confirmation
 * is not out of gauge.
 */
function gaugeBlock(judgements: readonly GaugeJudgement[], flatRack: boolean): Required<QuoteGauge> | null {
  const worst = worstJudgement(judgements);
  if (!worst) return null;
  const most = (pick: (m: CargoMeasures) => number) => Math.max(...judgements.map((j) => pick(j.measures)));
  const measures = flatRack ? { length: most((m) => m.length), width: most((m) => m.width), height: most((m) => m.height) } : worst.measures;
  return { inGauge: !judgements.some((j) => isOog(j.check)), ...measures };
}

/** A quote's container lines in a few words: "2 × 40' HC (12,000 kg each) + 1 × 40' FR"; "None" for no line. */
export const boxesWords = (lines: readonly QuoteBox[] | undefined): string =>
  (lines ?? []).map((l) => `${l.qty} × ${l.type}${l.weight ? ` (${l.weight.toLocaleString("en-US")} kg each)` : ""}`).join(" + ") || "None";

/** A quote's out-of-gauge block in a few words: "Out of gauge · 1,262 × 300 × 250 cm (L × W × H)"; "Not answered" for an empty one. */
export function gaugeWords(oog: QuoteGauge | null | undefined): string {
  if (!oog || (typeof oog.inGauge !== "boolean" && !oog.length && !oog.width && !oog.height)) return "Not answered";
  const n = (v: number | undefined) => (v ? v.toLocaleString("en-US") : "?");
  return `${oog.inGauge === true ? "In gauge" : oog.inGauge === false ? "Out of gauge" : "In gauge not answered"} · ${n(oog.length)} × ${n(oog.width)} × ${n(oog.height)} cm (L × W × H)`;
}

/** Why a plan cannot be put on a quote, in a sentence; null when it can. */
export function putOnQuoteRefusal(found: PlanForQuote, quote: { containerQuote: boolean; closed: boolean }): string | null {
  if (!quote.containerQuote) return "Only a Sea FCL quote carries container lines: this quote's cargo is its package lines.";
  if (quote.closed) return "This quote is closed: its cargo can no longer be changed.";
  if (found.containers.length === 0) return "The plan loads no container: there is nothing to put on the quote.";
  if (found.unknown.length > 0) return `A quote's container list has no ${found.unknown.join(" or ")}: nominate other equipment in the plan, or type the containers on the quote yourself.`;
  return null;
}

/**
 * Whether "Put on the quote" may write the plan's lines: the plan is worked out, nothing refuses it,
 * and neither the plan nor the planner's settings are being read - until they are, the lines would
 * come from an older copy of the plan or from the starting figures.
 */
export const canPutOnQuote = (found: PlanForQuote | null, refusal: string | null, reading: boolean): boolean => found !== null && refusal === null && !reading;

/** The container types a quote has now and would no longer have with the plan's lines, in the quote's order. */
export const droppedTypes = (now: readonly QuoteBox[], next: readonly QuoteBox[]): string[] => [...new Set(now.map((l) => l.type.trim()).filter((type) => type && !next.some((n) => n.type === type)))];
