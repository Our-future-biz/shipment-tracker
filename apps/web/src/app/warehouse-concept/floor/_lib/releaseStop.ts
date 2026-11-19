// A WH release floor mode sent that the prepayment stop refused (api warehouseConcept services/releasePayment). The
// server's sentence ends by telling a manager to give a reason - a field floor mode does not have (mock test council
// n28). Its first sentence says why; what to do next points to the full gate job, which asks a manager for the
// reason and offers a user "Ask a manager to release".

/** The stop's first sentence (why it stopped), without what the server says to do next. */
export function stopWhy(message: string): string {
  const end = message.search(/\.\s/);
  return (end >= 0 ? message.slice(0, end + 1) : message).trim();
}

/** What floor mode says of the stop, followed by a link to the full gate job. */
export function floorReleaseStopText(message: string, manager: boolean): { why: string; next: string } {
  return { why: stopWhy(message), next: manager ? "Release it with a reason on the full gate job" : "Ask a manager to release it on the full gate job" };
}
