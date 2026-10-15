import { exceptionRepository } from "../repositories/exception.repository";

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

/** The company's delivery exceptions decided CLAIM_HAULIER against each target, summed per target of the same kind. */
export const exceptionClaims: ClaimsSource = {
  async claimedFor(companyId, targets) {
    const kindOf = new Map(targets.map((t) => [t.id, t.kind]));
    const rows = await exceptionRepository.claimsFor(companyId, [...kindOf.keys()]);
    const claimed = new Map<string, number>();
    for (const r of rows) {
      if (kindOf.get(r.targetId) !== r.targetKind) continue;
      claimed.set(r.targetId, (claimed.get(r.targetId) ?? 0) + r.amount);
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
