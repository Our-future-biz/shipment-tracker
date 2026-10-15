// What is claimed against a haulier for its trips and partner deliveries (delivery exceptions
// decided CLAIM_HAULIER, Phase 6 A). Matching a haulier invoice expects the target's cost less
// the claimed amount, shown separately on the line.

export interface ClaimTarget {
  kind: "TRIP" | "PARTNER_LEG";
  id: string;
}

/** Where claims come from: target id → the amount claimed (in the target's currency); a target without a claim is left out. */
export interface ClaimsSource {
  claimedFor(targets: ClaimTarget[]): Promise<Map<string, number>>;
}

/**
 * No claims yet: wired to delivery exceptions at merge (the CLAIM_HAULIER exceptions of the
 * consignments on the trip / of the partner leg's consignment, summed per target).
 */
export const noClaims: ClaimsSource = {
  async claimedFor() {
    return new Map();
  },
};

let source: ClaimsSource = noClaims;

/** The claims source in use. */
export const haulierClaims: ClaimsSource = {
  claimedFor: (targets) => source.claimedFor(targets),
};

/** Sets where claims come from (wired to delivery exceptions at merge). */
export function setClaimsSource(next: ClaimsSource): void {
  source = next;
}
