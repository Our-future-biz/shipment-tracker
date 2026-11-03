import { fx, trucking } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { roadMarginApplies, type MarginContext } from "../lib/roadMargin";
import type { QuoteRates } from "../lib/quoteMargin";

// Today's ČNB sheet with the company ROE % - the very rates the quote editor prices with (fx
// /fx/rates), so the gate, the cockpit and the screen read one margin. Rates the fx service cannot
// give are missing: a margin that needs one then says so instead of the read failing. Read before
// any row lock (a slow answer must not hold one).
export async function todaysSheet(at: Date): Promise<QuoteRates> {
  const sheet = await fx.fxRatesOn({}).then(
    (r) => ({ roePct: r.roePct, rates: Object.fromEntries(r.rates.filter((x) => x.rate > 0).map((x) => [x.currency, x.rate])) }),
    () => ({ roePct: 100, rates: {} }),
  );
  return { today: businessDay(at), ...sheet };
}

// What the road margins of these quotes are judged with: the Trucking margin floor and today's
// sheet. Undefined - and nothing is asked - when the margin rule applies to none of them.
export async function marginsFor(rows: { data: unknown }[], at: Date): Promise<MarginContext | undefined> {
  if (!rows.some((row) => roadMarginApplies(row.data))) return undefined;
  const [floor, sheet] = await Promise.all([trucking._internalTruckingMarginFloor(), todaysSheet(at)]);
  return { floor, ...sheet };
}
