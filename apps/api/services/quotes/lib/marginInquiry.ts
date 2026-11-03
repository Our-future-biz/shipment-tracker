// The rules of a margin inquiry (Council Outlay 6, step 3): a rep asks a manager to approve a
// margin below the floor; the manager approves it, approves it down to a counter margin, or
// rejects it. Pure, so every rule is covered by a test.

import { businessDay, businessMinutes, addDays } from "../../../lib/businessDate";
import { isWorkingDay } from "../../../lib/workingDays";

/** Why a rep asks; "Other" needs their own words. */
export const INQUIRY_REASONS = ["Competitor price", "Tender or volume", "New or strategic customer", "Retention", "Market drop", "Other"] as const;
export type InquiryReason = (typeof INQUIRY_REASONS)[number];

export const MAX_INQUIRY_NOTE = 1000;
export const MAX_INQUIRY_FIELD = 200;
/** A reason the manager gives with a counter margin or a rejection: at least this long. */
export const MIN_DECISION_COMMENT = 3;

/** Office hours a waiting inquiry is aged in (Prague): 08:00-17:00 on Czech working days. */
const OFFICE_START = 8 * 60;
const OFFICE_END = 17 * 60;
/** After this many office minutes the owner's manager has not answered, the admins are told too (D14). */
export const ESCALATE_AFTER_OFFICE_MINUTES = 4 * 60;
/** …and as soon as the customer's "needs it by" is this close. */
export const ESCALATE_BEFORE_NEEDS_BY_MS = 2 * 3_600_000;

/** Office minutes (08:00-17:00 Prague, working days) between two moments; 0 when `to` is not later. */
export function officeMinutesBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  const first = businessDay(from);
  const last = businessDay(to);
  let total = 0;
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (!isWorkingDay(day)) continue;
    const start = Math.max(OFFICE_START, day === first ? businessMinutes(from) : 0);
    const end = Math.min(OFFICE_END, day === last ? businessMinutes(to) : 24 * 60);
    if (end > start) total += end - start;
  }
  return total;
}

/** What decides who is told about a waiting inquiry. */
export interface InquiryWaiting {
  requestedAt: Date;
  needsBy: Date | null;
  /** The owner's manager when the rep asked; null = nobody set. */
  notifyUserId: string | null;
}

/** Whether the admins are told too: nobody to tell first, the manager too long without an answer, or the customer's moment close. */
export function isEscalated(inquiry: InquiryWaiting, now: Date): boolean {
  if (!inquiry.notifyUserId) return true;
  if (officeMinutesBetween(inquiry.requestedAt, now) >= ESCALATE_AFTER_OFFICE_MINUTES) return true;
  return inquiry.needsBy !== null && inquiry.needsBy.getTime() - now.getTime() <= ESCALATE_BEFORE_NEEDS_BY_MS;
}

/** Whether `user` is told about the waiting inquiry: the owner's manager, or an admin once it is escalated. */
export function isToldAbout(inquiry: InquiryWaiting, user: { id: string; role: string }, now: Date): boolean {
  if (inquiry.notifyUserId === user.id) return true;
  return (user.role === "admin" || user.role === "superadmin") && isEscalated(inquiry, now);
}

/** Why an ask is refused, finishing "…"; null when it may go. */
export function askProblem(input: { reason: string; note: string; competitorPrice?: string; volume?: string; needsBy?: string | null }, now: Date): string | null {
  if (!(INQUIRY_REASONS as readonly string[]).includes(input.reason)) return `Pick a reason: ${INQUIRY_REASONS.join(", ")}`;
  const note = input.note.trim();
  if (input.reason === "Other" && note.length < MIN_DECISION_COMMENT) return "Say why, in a few words";
  if (note.length > MAX_INQUIRY_NOTE) return `The note is too long (at most ${MAX_INQUIRY_NOTE} characters)`;
  if ((input.competitorPrice ?? "").length > MAX_INQUIRY_FIELD || (input.volume ?? "").length > MAX_INQUIRY_FIELD) {
    return `The competitor price and the volume take at most ${MAX_INQUIRY_FIELD} characters each`;
  }
  if (input.needsBy) {
    const at = new Date(input.needsBy);
    if (Number.isNaN(at.getTime())) return "\"Needs it by\" must be a date and time";
    if (at.getTime() < now.getTime()) return "\"Needs it by\" has already passed";
  }
  return null;
}

/** A manager's answer, as the API takes it. */
export interface InquiryAnswer {
  decision: "approve" | "counter" | "reject";
  /** For a counter: the lowest margin in CZK the manager accepts. */
  counterMarginCzk?: number | null;
  comment?: string;
}

/** Why an answer is refused; null when it may be stored. */
export function answerProblem(answer: InquiryAnswer): string | null {
  const comment = (answer.comment ?? "").trim();
  if (comment.length > MAX_INQUIRY_NOTE) return `The comment is too long (at most ${MAX_INQUIRY_NOTE} characters)`;
  if (answer.decision === "counter") {
    const m = answer.counterMarginCzk;
    if (typeof m !== "number" || !Number.isFinite(m)) return "Give the lowest margin in CZK you accept";
    if (comment.length < MIN_DECISION_COMMENT) return "Say why, so the rep knows what to aim for";
  }
  if (answer.decision === "reject" && comment.length < MIN_DECISION_COMMENT) return "Say why the margin is rejected";
  return null;
}
