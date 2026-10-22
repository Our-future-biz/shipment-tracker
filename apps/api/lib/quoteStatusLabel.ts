/**
 * How a quote's status is named on the screens and in a refusal. The two derived statuses are
 * here as well: Expired (a Quoted or Feedback quote whose validity has passed) and Replaced (a
 * quote whose revision took over).
 */
export const QUOTE_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "Draft",
  ready_to_send: "Ready to Send",
  quoted: "Quoted",
  feedback: "Feedback",
  revised: "Revised",
  won: "Won",
  lost: "Lost",
  expired: "Expired",
  replaced: "Replaced",
};

/** The label of a status; one not known is quoted as it is ('"on_hold"'), a name of Object.prototype too. */
export function quoteStatusLabel(status: string): string {
  return Object.hasOwn(QUOTE_STATUS_LABELS, status) ? QUOTE_STATUS_LABELS[status] : `"${status}"`;
}
