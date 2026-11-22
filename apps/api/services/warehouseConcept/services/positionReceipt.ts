import type { GateEvent } from "../schemas/gateMovement.schema";

// The receipt of loose import cargo (Q19 of the User Council, 20 Nov: "yes"): an outbound (výdej)
// position with no container arrives by truck, so there is no stripping tally to tick it off. The
// receipt keeps the same facts a tally tick keeps — pieces counted, condition, location — and
// receives the position as the tick does: the received date (its free time starts), the stock
// line, and the received date and WCZ reference for its shipment. The typed "Received in
// warehouse" date stays possible (the desk); a receipt replaces it and gives it back when voided.
//
// The facts live on the receipt's gate event (`receipt`), as a tally's live on its container
// house: the gate record has no columns for them and the house row needs a container. Pure, no
// imports from the services (no import cycle).

export const RECEIPT_EVENT = "positionReceived";
export const RECEIPT_VOIDED_EVENT = "positionReceiptVoided";
/** The outbox stamp of the shipment update a receipt owes, so its void can cancel it. */
export const RECEIPT_STAMP = "receipt";
/** The condition that needs nothing more (TALLY_CONDITIONS on the web). */
export const GOOD_CONDITION = "Good";
export const MAX_RECEIPT_PIECES = 100_000;

export interface ReceiptFacts {
  pieces: number | null;
  condition: string;
  location: string;
}

/**
 * The receipt's gate event: a gate event with the counted facts, and the id of the shipment update
 * it owes (`outboxId`), so its void tells only about that update and those written since (a
 * manager's move of its day earlier, R28) — not one of an earlier receipt voided before.
 */
export type ReceiptEvent = GateEvent & { receipt?: ReceiptFacts; outboxId?: string };

/**
 * Nothing counted is not a receipt (owner's answer R29, mock council 20 Nov 2026): a receipt of
 * 0 pieces is refused — cargo that did not come is a Short exception. The web's FloorReceipt says
 * the same.
 */
export const ZERO_PIECES = "0 colli counted is not a receipt — if the cargo did not come, record a Short exception instead";

/** Why these counted pieces are not a receipt, or null (null = not counted, the expected pieces count). */
export function receiptPiecesRefusal(pieces: number | null): string | null {
  if (pieces === null) return null;
  if (!Number.isInteger(pieces) || pieces < 0 || pieces > MAX_RECEIPT_PIECES) return "Colli counted must be a whole number from 1";
  return pieces === 0 ? ZERO_PIECES : null;
}

const MANAGER_ROLES = ["manager", "admin", "superadmin"];

/**
 * Why `role` may not move the "Received in warehouse" day a receipt set from `before` to `after`
 * (YYYY-MM-DD), or null. A manager may move it earlier, with a reason (owner's answer R28, mock
 * council 20 Nov 2026) — the same storage rule as the typed date, and the counted facts stay. Later
 * or cleared is storage given away and the count's own day: that is voiding the receipt.
 */
export function receiptDateMoveRefusal(before: string, after: string, role: string, reason: string): string | null {
  if (!MANAGER_ROLES.includes(role)) return "Received in warehouse is set by the receipt — a manager moves it earlier (with a reason) or voids the receipt";
  if (!after) return "Received in warehouse is set by the receipt — it can't be cleared; void the receipt instead";
  if (before && after > before) return "A manager moves the receipt's date only earlier — to move it later, void the receipt";
  const why = reason.trim();
  if (why.length < 3) return "Give a reason (at least 3 characters) to move the receipt's date earlier";
  if (why.length > 500) return "The reason is too long (at most 500 characters)";
  return null;
}

/** "6 of 6 pcs counted · Damaged packaging · at A-03-2" — the tally's words, for History. */
export function countedText(pieces: number | null, expected: number, condition: string, location: string): string {
  return [pieces !== null ? `${pieces} of ${expected} colli counted` : "", condition, location ? `at ${location}` : ""].filter(Boolean).join(" · ");
}

/** A condition other than "Good" (and not blank): the cargo may be damaged — an exception is offered (Q20). */
export const conditionNotGood = (condition: string | null | undefined) => {
  const c = (condition ?? "").trim();
  return !!c && c !== GOOD_CONDITION;
};

/** The words that offer the Damaged exception after a tally tick or a receipt with such a condition. */
export const damageNotice = (condition: string) => `${condition.trim()} — record a Damaged exception?`;

/** An exception the client may offer after a receipt; a Damaged one has no count (the person enters it). */
export interface ReceiptSuggestion {
  type: "Short" | "Over" | "Damaged";
  pieces: number | null;
}

/** What a receipt offers: the count difference (Short / Over) and a condition that is not Good (Damaged). */
export function receiptSuggestions(expected: number, pieces: number | null, condition: string): ReceiptSuggestion[] {
  const out: ReceiptSuggestion[] = [];
  if (pieces !== null && expected > 0 && pieces !== expected) out.push({ type: pieces < expected ? "Short" : "Over", pieces: Math.abs(expected - pieces) });
  if (conditionNotGood(condition)) out.push({ type: "Damaged", pieces: null });
  return out;
}

/** The toast text of the suggestions ("" when none). */
export function suggestionsNotice(s: ReceiptSuggestion[], expected: number, condition: string): string {
  return s
    .map((x) => (x.type === "Damaged" ? damageNotice(condition) : `${x.type} ${x.pieces} colli against the expected ${expected} — record an exception?`))
    .join(" · ");
}

/** The facts of the receipt that counts (the last one not voided since); null when none. */
export function receiptOf(events: readonly GateEvent[]): ReceiptFacts | null {
  const last = [...events].reverse().find((e) => e.kind === RECEIPT_EVENT || e.kind === RECEIPT_VOIDED_EVENT) as ReceiptEvent | undefined;
  return last?.kind === RECEIPT_EVENT ? (last.receipt ?? null) : null;
}

/** The last receipt event not voided since (to restore what it replaced); null when none. */
export function lastReceiptEvent(events: readonly GateEvent[]): ReceiptEvent | null {
  const last = [...events].reverse().find((e) => e.kind === RECEIPT_EVENT || e.kind === RECEIPT_VOIDED_EVENT) as ReceiptEvent | undefined;
  return last?.kind === RECEIPT_EVENT ? last : null;
}

/** Loose import cargo waits for its receipt before the WH release. Must match RECEIPT_FIRST on the web (gate-log/_lib/steps.ts). */
export const RECEIPT_FIRST = "Not received yet — record the receipt first (colli, condition, location), or the Received in warehouse date";

/** Operation types that move the cargo in a container (FCL, container yard): never loose cargo. */
const CONTAINER_OPERATION = /^(FCL|Container yard)/;

/**
 * Truly loose import cargo: outbound (výdej), no container house, no container number and not an
 * FCL / container-yard operation. Import FCL cargo comes in its container (stripped or kept in the
 * yard) even without a container house here, so it has no receipt of its own. The web's
 * isLooseImport (steps.ts) and looseReceivedOkSql (houses.ts) are the same rule.
 */
export function isLooseImport(m: { visit: string; containerNumber?: string | null; operationType?: string | null }, inContainer: boolean): boolean {
  return m.visit === "výdej" && !inContainer && !(m.containerNumber ?? "").trim() && !CONTAINER_OPERATION.test(m.operationType ?? "");
}

/**
 * Loose import cargo (isLooseImport) that is not received yet — no receipt and no typed
 * "Received in warehouse" date. The web's receiptMissing (steps.ts) is the same rule.
 */
export function receiptMissing(
  m: { visit: string; receivedAt: Date | null; loadInDate: string; impRelease: Date | null; leftAt?: Date | null; containerNumber?: string | null; operationType?: string | null },
  inContainer: boolean,
): boolean {
  return isLooseImport(m, inContainer) && !m.impRelease && !m.leftAt && !m.receivedAt && !/^\d{4}-\d{2}-\d{2}$/.test(m.loadInDate ?? "");
}

export interface ReceiptMovement {
  visit: string;
  receivedAt: Date | null;
  impRelease: Date | null;
  status: string;
  containerNumber?: string | null;
  operationType?: string | null;
}

/**
 * Why the position takes no receipt now, or null. `container` is the number of the container the
 * position is a house of (null for none): a house is received at that container's tally.
 */
export function receiptBlocked(m: ReceiptMovement, container: string | null): string | null {
  if (m.visit !== "výdej") return "Only outbound (import) cargo has a receipt here — inbound cargo is received by the WH receipt stamp";
  if (container !== null) return `It is a house of container ${container} — it is received at that container's stripping tally`;
  if (!isLooseImport(m, false)) {
    // A sea LCL import carries its consol container's number too: name the number, not FCL (mock council S11-3).
    const number = (m.containerNumber ?? "").trim();
    if (number && !CONTAINER_OPERATION.test(m.operationType ?? "")) {
      return `It has container number ${number} — it is received at that container's stripping tally, or by the Received in warehouse date`;
    }
    return "It comes in a container (FCL / container yard) — it is not loose cargo, so it has no receipt here";
  }
  if (m.impRelease) return "The cargo is already released";
  if (m.receivedAt) return "The cargo is already received";
  if (m.status === "Refused") return "The position is refused";
  return null;
}
