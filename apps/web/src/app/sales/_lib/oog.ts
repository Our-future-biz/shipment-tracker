import type { QuoteContainerLine, QuoteOog, SalesQuoteData } from "./types";
import { isContainerQuote } from "./salesQuote";
import { checkOog, inGaugeMaximum, isOogType } from "@/lib/oogGauge";

// The table itself, and the check against it, are the app's one out-of-gauge table (@/lib/oogGauge):
// the Loading Planner reads the same. What is here is the quote's own: its block and its answers.
export { checkOog, gaugeAdvice, hasGauge, inGaugeMaximum, isOogType, type OogCheck } from "@/lib/oogGauge";

// Out-of-gauge cargo on open-top and flat-rack boxes: whether the cargo stands out of the box,
// by how much, and how many neighbouring slots on board that costs. The measures and the slot
// rules are indicative - a carrier's own equipment and its stowage planner decide.

/** Whether a quote carries such a box: its out-of-gauge requirements are then asked. */
export function hasOogEquipment(data: Pick<SalesQuoteData, "serviceType" | "containers">): boolean {
  return isContainerQuote(data) && (data.containers ?? []).some((c) => isOogType(c.type));
}

/**
 * The in-gauge answer as it goes on the quote. Yes, answered before any measure is typed, brings
 * the most the equipment takes in gauge with it, to be corrected to the real cargo; measures
 * already typed stay whichever way the answer goes, so a mis-click does not put the maximum in
 * their place.
 */
export function answerInGauge(current: QuoteOog, inGauge: boolean, types: string[]): Partial<QuoteOog> {
  const typed = !!(current.length || current.width || current.height);
  const max = inGauge && !typed ? inGaugeMaximum(types) : null;
  return max ? { inGauge, length: max.length, width: max.width, height: max.height } : { inGauge };
}

/** The distinct out-of-gauge types of a quote's container lines, in the order they are listed. */
export function oogTypes(containers: QuoteContainerLine[] | undefined): string[] {
  return [...new Set((containers ?? []).map((c) => c.type.trim()).filter(isOogType))];
}

/**
 * What an out-of-gauge quote still lacks: whether the cargo is in gauge, and its overall length,
 * widest and highest piece - pre-filled with the in-gauge maximum when it is. Null when nothing is
 * missing or the quote has no open top or flat rack.
 */
export function oogMissing(data: Pick<SalesQuoteData, "serviceType" | "containers" | "oog">): string | null {
  if (!hasOogEquipment(data)) return null;
  const o = data.oog ?? {};
  if (typeof o.inGauge !== "boolean") return "Say whether the cargo is in gauge";
  if (!(o.length && o.width && o.height)) return "Enter the cargo's overall length, width and height";
  return null;
}

/** The out-of-gauge details in one line, for the confirmation before moving on: "40' FR · Out of gauge · 1,262 × 300 × 250 cm (L × W × H) · 7 lost slots per container". */
export function oogSummary(data: Pick<SalesQuoteData, "containers" | "oog">): string {
  const o = data.oog ?? {};
  const types = oogTypes(data.containers);
  const parts = [types.join(", "), o.inGauge === true ? "In gauge" : o.inGauge === false ? "Out of gauge" : "In gauge not answered"];
  const fmt = (v: number | undefined) => (v ? v.toLocaleString("en-US") : "?");
  parts.push(`${fmt(o.length)} × ${fmt(o.width)} × ${fmt(o.height)} cm (L × W × H)`);
  if (o.length && o.width && o.height) {
    for (const type of types) {
      const check = checkOog(type, { length: o.length, width: o.width, height: o.height });
      if (check?.doesNotFit) parts.push(`${type}: ${check.doesNotFit.toLowerCase()}`);
      else if (check?.lost.total) parts.push(`${type}: ${check.lost.total} lost slot${check.lost.total === 1 ? "" : "s"} per container`);
      else if (check?.loading === "doors") parts.push(`${type}: load through the doors`);
      else if (check?.liner.length) parts.push(`${type}: needs the liner's confirmation`);
    }
  }
  return parts.join(" · ");
}
