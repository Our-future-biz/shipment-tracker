import type { RateLevelResult, RateRequest, ServiceLevelCode, TariffScope, TariffSide } from "../interfaces/interfaces";
import type { CoverageGap } from "../interfaces/reports.interfaces";
import { isPriced } from "./rateEngine";

// Coverage gaps (Phase 7): what of a rating could not be priced, as rows of trucking_rate_gap.
// Pure. A reason is stored without its dates ("… has no version valid on 30 Sep 2026" → "… has no
// version valid"), so the same gap asked for on another day adds to one row. "Nothing to charge"
// is a request without weight or size, not a missing tariff, and is not recorded.

export interface RateGapInput {
  side: TariffSide;
  scope: TariffScope;
  serviceLevel: ServiceLevelCode | null;
  postcode: string;
  reason: string;
}

/** No haulier's BUY tariff priced the lane (and none was left out as blocked). */
export const NO_BUY_REASON = "No haulier's buy tariff prices this lane";

const DAY_IN_REASON = /\s+on \d{1,2} [A-Z][a-z]{2} \d{4}/g;
const POSTCODE_IN_REASON = /postcode (\d{3}) (\d{2})\b/;

/** The reason as stored: the dates taken out. */
export const gapReason = (reason: string): string => reason.replace(DAY_IN_REASON, "").trim().slice(0, 300);

/** The postcode a reason names (a zone not found), else the delivery postcode. */
export function gapPostcode(reason: string, toPostcode: string): string {
  const m = POSTCODE_IN_REASON.exec(reason);
  return m ? `${m[1]}${m[2]}` : toPostcode;
}

const recordable = (reason: string) => !reason.startsWith("Nothing to charge");

/** The gaps of a rating (no duplicates: one upsert statement may touch a row once). */
export function gapsOf(req: Pick<RateRequest, "scope" | "toPostcode" | "includeBuy">, results: RateLevelResult[]): RateGapInput[] {
  const out = new Map<string, RateGapInput>();
  const add = (side: TariffSide, serviceLevel: ServiceLevelCode, rawReason: string) => {
    if (!recordable(rawReason)) return;
    const gap: RateGapInput = { side, scope: req.scope, serviceLevel, postcode: gapPostcode(rawReason, req.toPostcode), reason: gapReason(rawReason) };
    out.set([gap.side, gap.scope, gap.serviceLevel, gap.postcode, gap.reason].join("|"), gap);
  };
  for (const r of results) {
    if (!isPriced(r.sell)) add("SELL", r.serviceLevel, r.sell.reason);
    if (req.includeBuy && !r.buy.length && !r.excluded.length) add("BUY", r.serviceLevel, NO_BUY_REASON);
    if (r.internal && !isPriced(r.internal)) add("INTERNAL", r.serviceLevel, r.internal.reason);
  }
  return [...out.values()];
}

/** A stored gap as the report lists it. */
export const coverageGapItem = (r: { side: TariffSide; scope: TariffScope; serviceLevel: string; postcode: string; reason: string; count: number; lastAt: Date }): CoverageGap => ({
  side: r.side,
  scope: r.scope,
  serviceLevel: (r.serviceLevel || null) as ServiceLevelCode | null,
  postcode: r.postcode,
  reason: r.reason,
  count: r.count,
  lastAt: r.lastAt.toISOString(),
});
