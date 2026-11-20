// The condition noted at a stripping tally tick or a receipt of loose cargo (Q20, User Council 20
// Nov): one other than "Good" gets the same "record an exception?" question a count difference
// gets. Nothing opens by itself — how many pieces are damaged is the person's to say. The same rule
// as the API's (services/positionReceipt.ts). Pure.

export const GOOD_CONDITION = "Good";

/** A condition other than "Good" (and not blank). */
export const conditionNotGood = (condition: string | null | undefined) => {
  const c = (condition ?? "").trim();
  return !!c && c !== GOOD_CONDITION;
};

/**
 * What to ask after a tick: a count that differs from the expected pieces (received only — a short
 * opens its Short exception itself) and a condition other than Good (not for a house not arrived:
 * nothing of it was there). Empty when there is nothing to ask.
 */
export function tallyQuestions(outcome: string, expected: number, counted: number | null, condition: string): string[] {
  const out: string[] = [];
  if (outcome === "received" && counted !== null && expected > 0 && counted !== expected) {
    const n = Math.abs(expected - counted);
    out.push(`${counted < expected ? "Short" : "Over"} ${n} pc${n === 1 ? "" : "s"} against the expected ${expected}`);
  }
  if (outcome !== "not_arrived" && conditionNotGood(condition)) out.push(condition.trim());
  return out;
}

/** "Damaged packaging · at A-03-2" — the condition and location of a ticked house, for its line. */
export const conditionAndLocation = (condition: string | null | undefined, location: string | null | undefined) =>
  [(condition ?? "").trim(), (location ?? "").trim() ? `at ${(location ?? "").trim()}` : ""].filter(Boolean).join(" · ");

type EventLike = { kind: string; at: string; by: string; detail?: string };

/**
 * The receipt of loose import cargo that counts (the last one not voided since), from the gate
 * record's events: when, who, and what was counted ("6 of 6 pcs counted · Good · at A-03-2").
 * Event kinds as the API writes them (services/positionReceipt.ts).
 */
export function lastReceipt(events: readonly EventLike[]): EventLike | null {
  const last = [...events].reverse().find((e) => e.kind === "positionReceived" || e.kind === "positionReceiptVoided");
  return last?.kind === "positionReceived" ? last : null;
}
