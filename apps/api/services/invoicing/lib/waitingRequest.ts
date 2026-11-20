import { businessDay, businessTime } from "../../../lib/businessDate";

// One request waits per invoice, whatever its kind (user council B5, 20 Nov 2026). A change on the issue
// day cancels the invoice and a partial credit note corrects it; with both waiting, approving one takes
// the other back unasked. So the second is refused while the first waits, saying which one and since when.

/** "20.11.2026 09:13": a moment on the company's calendar and clock (Prague). */
export function askedAtText(at: Date): string {
  const [y, m, d] = businessDay(at).split("-");
  return `${d}.${m}.${y} ${businessTime(at)}`;
}

/** Why a request can't be asked while one of `kind` waits on the same invoice since `requestedAt`. */
export function waitingRequestProblem(kind: "credit" | "change", requestedAt: Date): string {
  const what = kind === "credit" ? "A partial credit note for this invoice" : "A change of this invoice";
  return `${what} is waiting for approval (asked ${askedAtText(requestedAt)}): wait for it or take it back`;
}
