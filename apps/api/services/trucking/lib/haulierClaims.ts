import { exceptionRepository } from "../repositories/exception.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";

// What is claimed against a haulier for its trips and partner deliveries (delivery exceptions
// decided CLAIM_HAULIER, Phase 6 A). Matching a haulier invoice expects the target's cost less
// the claimed amount, shown separately on the line.

export interface ClaimTarget {
  kind: "TRIP" | "PARTNER_LEG";
  id: string;
}

/** Where claims come from: target id → the amount claimed (in the target's currency); a target without a claim is left out. */
export interface ClaimsSource {
  claimedFor(companyId: string, targets: ClaimTarget[]): Promise<Map<string, number>>;
}

/** No claims at all (tests). */
export const noClaims: ClaimsSource = {
  async claimedFor() {
    return new Map();
  },
};

/** The buy currency of each target (a trip's or a partner delivery's price); a target without a price is left out. */
async function buyCurrencies(companyId: string, targets: ClaimTarget[]): Promise<Map<string, string>> {
  const ids = (kind: ClaimTarget["kind"]) => targets.filter((t) => t.kind === kind).map((t) => t.id);
  const [trips, legs] = await Promise.all([tripRepository.findMany(companyId, ids("TRIP")), legRepository.findMany(companyId, ids("PARTNER_LEG"))]);
  const out = new Map<string, string>();
  for (const x of [...trips, ...legs]) if (x.buy) out.set(x.id, x.buy.currency);
  return out;
}

/**
 * The company's delivery exceptions decided CLAIM_HAULIER against each target, summed per target
 * of the same kind in the target's buy currency. A claim is decided in that currency (C15); one in
 * another currency (from before that rule) is never added to it - it is left out (the invoice
 * then shows the full price as expected, and the claim must be settled by hand).
 */
export const exceptionClaims: ClaimsSource = {
  async claimedFor(companyId, targets) {
    const kindOf = new Map(targets.map((t) => [t.id, t.kind]));
    const [rows, currencyOf] = await Promise.all([exceptionRepository.claimsFor(companyId, [...kindOf.keys()]), buyCurrencies(companyId, targets)]);
    const claimed = new Map<string, number>();
    for (const r of rows) {
      if (kindOf.get(r.targetId) !== r.targetKind) continue;
      const currency = currencyOf.get(r.targetId);
      if (currency && r.currency !== currency) continue;
      claimed.set(r.targetId, Math.round(((claimed.get(r.targetId) ?? 0) + r.amount) * 100) / 100);
    }
    return claimed;
  },
};

let source: ClaimsSource = exceptionClaims;

/** The claims source in use. */
export const haulierClaims: ClaimsSource = {
  claimedFor: (companyId, targets) => source.claimedFor(companyId, targets),
};

/** Sets where claims come from (tests). */
export function setClaimsSource(next: ClaimsSource): void {
  source = next;
}
