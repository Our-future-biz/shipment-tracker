import log from "encore.dev/log";
import { fx, trucking } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { guardrailModeOf, type MarginContext } from "../lib/roadMargin";
import { guardrailSettings, ROAD_FALLBACK_FLOOR, type GuardrailSettings } from "../lib/guardrails";
import type { QuoteRates } from "../lib/quoteMargin";
import { quoteGuardrailRepository } from "../repositories/quoteGuardrail.repository";

// Today's ČNB sheet with the company ROE % - the very rates the quote editor prices with (fx
// /fx/rates), so the gate, the cockpit and the screen read one margin. Rates the fx service cannot
// give are missing: a margin that needs one then says so instead of the read failing. Read before
// any row lock (a slow answer must not hold one).
export async function todaysSheet(at: Date): Promise<QuoteRates> {
  const sheet = await fx.fxRatesOn({}).then(
    (r) => ({ roePct: r.roePct, rates: Object.fromEntries(r.rates.filter((x) => x.rate > 0).map((x) => [x.currency, x.rate])) }),
    (err) => {
      log.warn(err, "today's ČNB rates could not be loaded for the quote margins");
      return { roePct: 100, rates: {}, unavailable: true };
    },
  );
  return { today: businessDay(at), ...sheet };
}

/**
 * The company's floors per freight mode: those set in Sales over the defaults, and Trucking's for
 * Road. Trucking is asked only when `withRoad` (a Road quote is judged, or the settings are shown),
 * and a Trucking that cannot answer leaves Road with a stand-in and says so - an Air or Sea quote
 * never depends on it.
 */
export async function companyGuardrails(companyId: string, withRoad = true): Promise<{ settings: GuardrailSettings; roadFloorUnavailable: boolean }> {
  const road = withRoad
    ? trucking._internalTruckingMarginFloor().then(
        (floor) => ({ floor, unavailable: false }),
        (err) => {
          log.warn(err, "Trucking's margin floor could not be read: Road quotes wait until it can");
          return { floor: ROAD_FALLBACK_FLOOR, unavailable: true };
        },
      )
    : // Not read: a Road quote judged with these settings after all must not pass on the stand-in.
      Promise.resolve({ floor: ROAD_FALLBACK_FLOOR, unavailable: true });
  const [stored, { floor, unavailable }] = await Promise.all([quoteGuardrailRepository.list(companyId), road]);
  return { settings: guardrailSettings(stored, floor), roadFloorUnavailable: unavailable };
}

// What the margins of these quotes are judged with: the floors of the company and today's sheet
// (`sheet` when the caller already read it). Undefined - and nothing is asked - when no guardrail
// applies to any of them.
export async function marginsFor(companyId: string, rows: { data: unknown }[], at: Date, sheet?: QuoteRates): Promise<MarginContext | undefined> {
  const modes = new Set(rows.map((row) => guardrailModeOf(row.data)));
  modes.delete(null);
  if (!modes.size) return undefined;
  const [{ settings, roadFloorUnavailable }, rates] = await Promise.all([companyGuardrails(companyId, modes.has("Road")), sheet ?? todaysSheet(at)]);
  return { settings, roadFloorUnavailable, ...rates };
}
