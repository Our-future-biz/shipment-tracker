import { addDays } from "../../../lib/businessDate";
import type { ClaimMode, ClaimModeLimits, ClaimModesLimits } from "../interfaces/interfaces";
import { freightKindOf } from "./trackingEvents";

// The company's claim time limits (Council Outlay 11, D21): how many days after delivery the
// carrier must be told of a cargo claim, and how many months after it a suit is time-barred, by how
// the job travels. The numbers below are general practice (Hague-Visby, CMR, CIM, Montreal) - NOT
// confirmed with the owner's insurer - so the limits are a company setting, switched OFF until a
// manager confirms the numbers (claim_time_limits, services/claimTimeLimits.service). Switched off
// nothing here is said: no deadline on the Claims tab and no time-limit tag on Shipments → Managers.
// Pure; tested in tests/claimTimeLimits.test.ts.

export const CLAIM_MODES: readonly ClaimMode[] = ["sea", "air", "rail", "road"];

/** General practice: sea 3 days notice, road and rail 7, air 14; suit 1 year, air 2 years. The defaults shown, not confirmed. */
export const GENERAL_PRACTICE: Readonly<ClaimModesLimits> = {
  sea: { noticeDays: 3, suitMonths: 12 },
  air: { noticeDays: 14, suitMonths: 24 },
  rail: { noticeDays: 7, suitMonths: 12 },
  road: { noticeDays: 7, suitMonths: 12 },
};

/** The ranges a number may have: what the table's check allows too. */
export const NOTICE_DAYS_MAX = 365;
export const SUIT_MONTHS_MAX = 120;

/** The company's limits as the rules read them. `enabled` false: nothing is said. */
export interface ClaimTimeLimits {
  enabled: boolean;
  limits: ClaimModesLimits;
}

export const TIME_LIMITS_OFF: ClaimTimeLimits = { enabled: false, limits: GENERAL_PRACTICE };

export const TIME_LIMITS_NEED_NUMBERS = "Give the notice days and the suit months for sea, air, rail and road to switch the claim time limits on";

/** Why the numbers of one mode can't be kept, or null when they can. */
function modeProblem(mode: ClaimMode, limits: ClaimModeLimits): string | null {
  if (!Number.isInteger(limits.noticeDays) || limits.noticeDays < 1 || limits.noticeDays > NOTICE_DAYS_MAX) {
    return `The notice days (${mode}) must be a whole number from 1 to ${NOTICE_DAYS_MAX}`;
  }
  if (!Number.isInteger(limits.suitMonths) || limits.suitMonths < 1 || limits.suitMonths > SUIT_MONTHS_MAX) {
    return `The suit months (${mode}) must be a whole number from 1 to ${SUIT_MONTHS_MAX}`;
  }
  return null;
}

/**
 * The limits a save leaves, or the sentence saying why it can't be saved. Switching them on needs
 * all four modes' numbers in the same save - that is the manager confirming them; switched off, a
 * mode not sent keeps what it had.
 */
export function savedLimits(
  enabled: boolean,
  sent: Partial<Record<ClaimMode, ClaimModeLimits>>,
  had: ClaimModesLimits,
): { limits: ClaimModesLimits } | { problem: string } {
  if (enabled && CLAIM_MODES.some((m) => !sent[m])) return { problem: TIME_LIMITS_NEED_NUMBERS };
  const limits = { ...had };
  for (const mode of CLAIM_MODES) {
    const given = sent[mode];
    if (!given) continue;
    const problem = modeProblem(mode, given);
    if (problem) return { problem };
    limits[mode] = { noticeDays: given.noticeDays, suitMonths: given.suitMonths };
  }
  return { limits };
}

/** The day `months` calendar months after a YYYY-MM-DD day; the 31st of a shorter month is its last day. */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** A job as far as its claim deadlines go. */
export type ClaimJob = { tradeDirection: string; freightMode: string; department: string; actualDeliveryDate: string | null; actualArrival: string | null };

export interface ClaimDeadlines {
  /** What they are counted from: the actual delivery, else the ATA; null when the job has neither (no deadline can be said). */
  from: "delivery" | "arrival" | null;
  /** The last day the carrier may be told; null when not counted. */
  noticeBy: string | null;
  /** The day a suit is time-barred; null when not counted. */
  suitBy: string | null;
}

export const NO_DEADLINES: ClaimDeadlines = { from: null, noticeBy: null, suitBy: null };

/** How the job travels, for its limits: sea when nothing says otherwise, road for a Trucking job. */
export const claimModeOf = (job: Pick<ClaimJob, "tradeDirection" | "freightMode" | "department">): ClaimMode => freightKindOf(job);

/**
 * A cargo claim's deadlines on its job: counted from the actual delivery, else the ATA, with the
 * job's mode's numbers. None while the limits are off, or when the job has neither day.
 */
export function claimDeadlines(job: ClaimJob, limits: ClaimTimeLimits): ClaimDeadlines {
  if (!limits.enabled) return NO_DEADLINES;
  const from = job.actualDeliveryDate ? "delivery" : job.actualArrival ? "arrival" : null;
  const day = job.actualDeliveryDate ?? job.actualArrival;
  if (!from || !day) return NO_DEADLINES;
  const mode = limits.limits[claimModeOf(job)];
  return { from, noticeBy: addDays(day, mode.noticeDays), suitBy: addMonths(day, mode.suitMonths) };
}
