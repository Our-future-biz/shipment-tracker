// How far a supplier's tariffs reach (Council Review 5, K12): "Tariffs ending" warns on the last day it
// has one pricing without a gap, not on the soonest end of one version among several. Pure.

import { addDays } from "../../../lib/businessDate";
import type { TariffVersionRecord } from "../schemas/tariff.schema";

/**
 * The last day active versions price without a gap from `day` on: the latest end among those pricing on
 * the day, carried on by every version that starts by the next day after it; null as soon as one never ends,
 * and null when none prices on the day. Pure.
 */
export function coveredUntil(versions: readonly Pick<TariffVersionRecord, "status" | "validFrom" | "validTo">[], day: string): string | null {
  const active = versions.filter((v) => v.status === "active");
  let end = "";
  let reach = day;
  for (;;) {
    // Past the first round only versions ending after `end` touch, so each round reaches further.
    const touching = active.filter((v) => (v.validFrom ?? "") <= reach && (v.validTo === null || v.validTo >= (end ? addDays(end, 1) : day)));
    if (touching.some((v) => v.validTo === null)) return null;
    const furthest = touching.map((v) => v.validTo!).sort().at(-1);
    if (!furthest) return end || null;
    end = furthest;
    reach = addDays(end, 1);
  }
}

