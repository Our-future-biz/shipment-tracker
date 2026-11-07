// When a selling row a shipment sells on at cost may simply change. Pure, so the rule has its test.

/** An amount in cents, so two amounts compare exactly. */
export const centsOf = (amount: string) => Math.round(Number(amount) * 100);

/** Selling for less than the shipment's share cost takes a manager's approval; the same or more does not. */
export const needsApproval = (amount: string, cost: string) => centsOf(amount) < centsOf(cost);

/** Why a manager's answer can't be saved, if so: a rejection says why, an approval need not. */
export function answerProblem(decision: string, comment: string): string | null {
  if (decision !== "approve" && decision !== "reject") return 'decision must be "approve" or "reject"';
  if (decision === "reject" && comment.trim().length < 3) return "Say why it is rejected";
  return null;
}
