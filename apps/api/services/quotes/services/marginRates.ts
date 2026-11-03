import { fx, trucking } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { guardrailModeOf, type MarginContext } from "../lib/roadMargin";
import { guardrailSettings, type GuardrailSettings } from "../lib/guardrails";
import type { QuoteRates } from "../lib/quoteMargin";
import { quoteGuardrailRepository } from "../repositories/quoteGuardrail.repository";

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

/** The company's floors per freight mode: those set in Sales over the defaults, and Trucking's for Road. */
export async function companyGuardrails(companyId: string): Promise<GuardrailSettings> {
  const [stored, road] = await Promise.all([quoteGuardrailRepository.list(companyId), trucking._internalTruckingMarginFloor()]);
  return guardrailSettings(stored, road);
}

// What the margins of these quotes are judged with: the floors of the company and today's sheet.
// Undefined - and nothing is asked - when no guardrail applies to any of them.
export async function marginsFor(companyId: string, rows: { data: unknown }[], at: Date): Promise<MarginContext | undefined> {
  if (!rows.some((row) => guardrailModeOf(row.data))) return undefined;
  const [settings, sheet] = await Promise.all([companyGuardrails(companyId), todaysSheet(at)]);
  return { settings, ...sheet };
}
