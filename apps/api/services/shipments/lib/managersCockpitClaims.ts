import { addDays, businessDay } from "../../../lib/businessDate";
import type { AnyClaimStatus } from "../interfaces/interfaces";
import { claimDeadlines, TIME_LIMITS_OFF, type ClaimJob, type ClaimTimeLimits } from "./claimTimeLimits";
import { CLAIM_NOTICE_URGENT_DAYS_BEFORE, CLAIM_OPEN_ATTENTION_DAYS, CLAIM_SUIT_ATTENTION_DAYS, CLAIM_SUIT_URGENT_DAYS } from "./cockpitThresholds";
import type { OpsSignal } from "./managersCockpit";

// The cargo claims' signals on Shipments → Managers (Council Outlay 11, D21), family "claim". Pure;
// tested in tests/managersCockpitClaims.test.ts. A claim on costs is the Money tab's
// (lib/managersMoney cost_claim), not this file's.
//
// With the company's claim time limits switched on (lib/claimTimeLimits), per open cargo claim:
//   ATTENTION  from its creation while the carrier is not notified ("notice by dd.mm.", when the
//              job's delivery - else its ATA - says when that is)
//   URGENT     from CLAIM_NOTICE_URGENT_DAYS_BEFORE day before the notice deadline, and once it passed
//   ATTENTION  the suit time bar CLAIM_SUIT_ATTENTION_DAYS days ahead, URGENT at CLAIM_SUIT_URGENT_DAYS
//              and once it passed - until the claim is settled, rejected or withdrawn
// Switched off (the default: the numbers are not confirmed with the insurer) none of these: an
// open claim only says "Cargo claim open since dd.mm." CLAIM_OPEN_ATTENTION_DAYS days after it was
// raised - as it does with them on when none of them stands.

/** An open cargo claim of a job, as these rules read it. */
export interface CargoClaimFact {
  id: string;
  createdAt: Date;
  status: AnyClaimStatus;
  /** The day the carrier was notified; null when not yet. */
  noticeDate: string | null;
}

/** What the cockpit knows of the jobs' cargo claims. */
export interface ClaimFacts {
  /** The open cargo claims of the jobs, by shipment id (a job with none has no entry); null when they could not be read - then no tag. */
  byJob: ReadonlyMap<string, readonly CargoClaimFact[]> | null;
  /** The company's time limits; null when they could not be read - then no time-limit tag (the "open since" still stands). */
  limits: ClaimTimeLimits | null;
}

/** Nothing asked: no tag. */
export const NO_CLAIM_FACTS: ClaimFacts = { byJob: new Map(), limits: TIME_LIMITS_OFF };

/** What the page shows after "Not known right now:" for the parts: the claims, the limits, and the jobs no longer active that have one (X8). */
export const CLAIM_PARTS = { claims: "cargo claims", limits: "claim time limits", claimOnlyJobs: "claims of invoiced or cancelled jobs" } as const;

// On lib/managersCockpit OPS_RANK's own scale (lower = higher in its card). URGENT after the
// warehouse's and Trucking's own (61-62) and before free time (80): a deadline in days that, once
// missed, loses the claim. ATTENTION after theirs (251-252), before Needs Attention's late ones.
export const CLAIM_RANK = {
  noticeUrgent: 63,
  suitUrgent: 64,
  notNotified: 253,
  suitAhead: 254,
  openSince: 256,
} as const;

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const dmy = (day: string) => `${dm(day)}${day.slice(0, 4)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const tag = (urgent: boolean, rank: number, text: string): OpsSignal => ({ rank, text, urgent, kind: "claim", area: "details" });

/** The rows of a read as the facts: a row nobody filled in (no cargo state, note or amount) is no claim, as for the job's Claim field. */
export function claimFactsByJob(
  rows: readonly (CargoClaimFact & { shipmentId: string; cargoState: string; note: string; claimAmount: string | null; claimCurrency: string })[],
): Map<string, CargoClaimFact[]> {
  const map = new Map<string, CargoClaimFact[]>();
  for (const r of rows) {
    if (!`${r.cargoState}${r.note}${r.claimCurrency}`.trim() && r.claimAmount === null) continue;
    const list = map.get(r.shipmentId) ?? [];
    list.push({ id: r.id, createdAt: r.createdAt, status: r.status, noticeDate: r.noticeDate });
    map.set(r.shipmentId, list);
  }
  return map;
}

/** One open cargo claim's tags on `today`. */
function oneClaim(claim: CargoClaimFact, job: ClaimJob, limits: ClaimTimeLimits | null, today: string): OpsSignal[] {
  const out: OpsSignal[] = [];
  if (limits?.enabled) {
    const { noticeBy, suitBy } = claimDeadlines(job, limits);
    if (!claim.noticeDate) {
      if (!noticeBy) out.push(tag(false, CLAIM_RANK.notNotified, "Cargo claim: carrier not notified"));
      else if (noticeBy < today) out.push(tag(true, CLAIM_RANK.noticeUrgent, `Cargo claim: carrier not notified, notice deadline ${dm(noticeBy)} passed`));
      else if (addDays(noticeBy, -CLAIM_NOTICE_URGENT_DAYS_BEFORE) <= today) {
        out.push(tag(true, CLAIM_RANK.noticeUrgent, noticeBy === today ? "Cargo claim: notify the carrier today" : `Cargo claim: notify the carrier by ${dm(noticeBy)}`));
      } else out.push(tag(false, CLAIM_RANK.notNotified, `Cargo claim: carrier not notified · notice by ${dm(noticeBy)}`));
    }
    if (suitBy) {
      const left = daysBetween(today, suitBy);
      if (left < 0) out.push(tag(true, CLAIM_RANK.suitUrgent, `Cargo claim: suit time-barred since ${dmy(suitBy)}`));
      else if (left <= CLAIM_SUIT_URGENT_DAYS) out.push(tag(true, CLAIM_RANK.suitUrgent, `Cargo claim: suit time bar ${dmy(suitBy)} · ${plural(left, "day")} left`));
      else if (left <= CLAIM_SUIT_ATTENTION_DAYS) out.push(tag(false, CLAIM_RANK.suitAhead, `Cargo claim: suit time bar ${dmy(suitBy)} · ${plural(left, "day")} left`));
    }
  }
  if (out.length === 0) {
    const raised = businessDay(claim.createdAt);
    if (daysBetween(raised, today) >= CLAIM_OPEN_ATTENTION_DAYS) out.push(tag(false, CLAIM_RANK.openSince, `Cargo claim open since ${dm(raised)}`));
  }
  return out;
}

/**
 * The tags of a job's open cargo claims on `today` (the Prague day). The same words twice - two
 * claims of one job at the same stage - are said once. Nothing when the claims could not be read.
 */
export function claimSignals(job: ClaimJob & { id: string }, facts: ClaimFacts, today: string): OpsSignal[] {
  const claims = facts.byJob?.get(job.id);
  if (!claims?.length) return [];
  const seen = new Set<string>();
  return claims
    .flatMap((c) => oneClaim(c, job, facts.limits, today))
    .filter((s) => {
      if (seen.has(s.text)) return false;
      seen.add(s.text);
      return true;
    });
}
