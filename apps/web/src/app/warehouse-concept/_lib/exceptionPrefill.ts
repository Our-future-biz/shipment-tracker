// What the phone's "Damage / short / over" screen opens with after a receipt or a tally tick that
// found something: the type and pieces found ("Short 2 pcs"), not the plain Damaged, 1 pc (mock
// council S11-1). The person can still change both. Pure.

import { conditionNotGood } from "./tallyCondition";

/** The exception types, as the gate job's ExceptionsPanel lists them. */
const TYPES = ["Damaged", "Short", "Over"] as const;
export type ExceptionPrefill = { type: (typeof TYPES)[number]; pieces: number };

const isType = (v: unknown): v is ExceptionPrefill["type"] => (TYPES as readonly unknown[]).includes(v);
const wholePieces = (n: number) => (Number.isInteger(n) && n >= 1 ? n : 1);

/** The first suggestion of a receipt (the server's order: a count difference, then the condition). */
export function suggestionPrefill(suggestions: readonly { type: string; pieces: number | null }[]): ExceptionPrefill | null {
  const s = suggestions.find((x) => isType(x.type));
  return s ? { type: s.type as ExceptionPrefill["type"], pieces: wholePieces(s.pieces ?? 1) } : null;
}

/**
 * After a tally tick: a received count that differs from the expected pieces, else a condition other
 * than Good (how many pieces are damaged is the person's to say: 1 to start). The same questions as
 * tallyQuestions; null when nothing was found.
 */
export function tallyPrefill(outcome: string, expected: number, counted: number | null, condition: string): ExceptionPrefill | null {
  if (outcome === "received" && counted !== null && expected > 0 && counted !== expected) {
    return { type: counted < expected ? "Short" : "Over", pieces: Math.abs(expected - counted) };
  }
  if (outcome !== "not_arrived" && conditionNotGood(condition)) return { type: "Damaged", pieces: 1 };
  return null;
}

/** The link's query for the exception screen ("view=damage&type=Short&pieces=2"). */
export function exceptionViewQuery(p: ExceptionPrefill | null): string {
  return p ? `view=damage&type=${encodeURIComponent(p.type)}&pieces=${p.pieces}` : "view=damage";
}

/** The prefill a link carries, or null when it carries none (or nothing valid). */
export function prefillFromParams(type: string | null, pieces: string | null): ExceptionPrefill | null {
  if (!isType(type)) return null;
  const n = Number(pieces);
  return { type, pieces: wholePieces(n) };
}
