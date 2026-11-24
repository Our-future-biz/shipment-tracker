import { CONTAINER_TYPES } from "@/lib/cargo";
import { isOogType } from "@/lib/oogGauge";
import { cargoMeasures, gaugeCheckOf, isOog } from "./loadStats";
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
  /** The out-of-gauge block: the largest measures over the plan's open tops and flat racks; null when it has none. */
  oog: Required<QuoteGauge> | null;
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
  const measures = special.map(cargoMeasures);
  const most = (pick: (m: { length: number; width: number; height: number }) => number) => Math.max(...measures.map(pick));
  return {
    containers: [...byType].map(([type, { qty, weightKg }]) => ({ qty, type, weight: Math.round(weightKg / qty) })),
    oog:
      special.length > 0
        ? {
            // In gauge unless the one table calls a container out of gauge; the liner's confirmation is not out of gauge.
            inGauge: !special.some((load) => {
              const check = gaugeCheckOf(load);
              return check !== null && isOog(check);
            }),
            length: most((m) => m.length),
            width: most((m) => m.width),
            height: most((m) => m.height),
          }
        : null,
    unknown: [...byType.keys()].filter((type) => !CONTAINER_TYPES.includes(type)),
    notLoaded: plan.notLoaded.reduce((sum, entry) => sum + entry.colli, 0),
  };
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

/** The container types a quote has now and would no longer have with the plan's lines, in the quote's order. */
export const droppedTypes = (now: readonly QuoteBox[], next: readonly QuoteBox[]): string[] => [...new Set(now.map((l) => l.type.trim()).filter((type) => type && !next.some((n) => n.type === type)))];
