// A missed cut-off a manager dismissed (Council Outlay 11, step 3): "we know, and it is settled" - the cargo
// went on a later vessel, the carrier took the VGM late. The shared rule (lib/managersCockpit cutoffsOf) keeps a
// missed cut-off URGENT until the job leaves (D7); a dismissal ends that for the date the cut-off had then.
// One rule for both pages - Shipments → Managers and the Shipments list's Needs Attention drop a dismissed
// cut-off through withoutDismissed, so they never disagree. Pure: the reads are in
// services/cutoffDismissal.service.

import type { CutoffDue, CutoffJob, CutoffKey, OpsCockpitJob, OpsDay } from "./managersCockpit";
import { cargoReadySignals, cutoffsOf } from "./managersCockpit";

/** A live dismissal, as the rule reads it: which cut-off, and the date it had when it was dismissed. */
export interface CutoffDismissed {
  cutoff: CutoffKey;
  /** YYYY-MM-DD. */
  date: string;
}

/** The five cut-offs, as the table's check lists them. */
export const CUTOFF_KEYS: readonly CutoffKey[] = ["closingDate", "vgmClosing", "siClosing", "amsDeadline", "isfDeadline"];

/** What a cut-off is called in a refusal and in the job's history. */
export const CUTOFF_NAMES: Record<CutoffKey, string> = {
  closingDate: "Closing",
  vgmClosing: "VGM",
  siClosing: "SI",
  amsDeadline: "AMS",
  isfDeadline: "ISF",
};

export const isCutoffKey = (value: string): value is CutoffKey => (CUTOFF_KEYS as readonly string[]).includes(value);

/**
 * The cut-offs that still count: without the missed ones a manager dismissed.
 *
 *   Only a MISSED cut-off is dropped. One that is due again - its time today moved later - shows,
 *   dismissal or not: what was dismissed is the miss, not the cut-off.
 *   Only while its date is the one dismissed: a cut-off moved to another day is a new one.
 */
export function withoutDismissed(cutoffs: readonly CutoffDue[], dismissals: readonly CutoffDismissed[] | null | undefined): CutoffDue[] {
  if (!dismissals?.length) return [...cutoffs];
  return cutoffs.filter((c) => c.state !== "missed" || !dismissals.some((d) => d.cutoff === c.key && d.date === c.date));
}

/**
 * The jobs with a missed cut-off: only their dismissals need reading. Asked of the rule itself -
 * with the cargo taken as not in, so a missed Closing is never overlooked - so this cannot drift
 * from it. No job, no read.
 */
export function jobsWithMissedCutoff<J extends CutoffJob & { id: string }>(jobs: readonly J[], day: OpsDay): string[] {
  return jobs.filter((job) => cutoffsOf(job, day, false).some((c) => c.state === "missed")).map((job) => job.id);
}

/**
 * The jobs whose dismissals Shipments → Managers reads: those with a missed cut-off, and those
 * whose cargo is ready only after their Closing (lib/managersCockpit cargoReadySignals) - a
 * dismissed Closing silences that tag too, also once the ETD has passed and the Closing itself no
 * longer counts. Asked of the two rules themselves, so this cannot drift from them.
 */
export function jobsWithMissedCutoffOrLateCargo<J extends CutoffJob & Pick<OpsCockpitJob, "cargoReadinessDate"> & { id: string }>(jobs: readonly J[], day: OpsDay): string[] {
  const missed = new Set(jobsWithMissedCutoff(jobs, day));
  return jobs.filter((job) => missed.has(job.id) || cargoReadySignals(job, false, day.today).length > 0).map((job) => job.id);
}

/** The dates of a job's dismissed Closing, from its dismissals: what the cockpit's cargo-ready rule no longer reports. */
export const closingDatesDismissed = (dismissals: readonly CutoffDismissed[] | null | undefined): string[] =>
  (dismissals ?? []).filter((d) => d.cutoff === "closingDate").map((d) => d.date);

/**
 * The missed cut-off a manager may dismiss now, or why not: only one the shared rule calls missed
 * or overdue at this moment (`cutoffs` is cutoffsOf for the job, now). Its date is what is stored.
 */
export function dismissable(cutoffs: readonly CutoffDue[], cutoff: CutoffKey): { date: string } | { refusal: string } {
  const found = cutoffs.find((c) => c.key === cutoff);
  if (found?.state === "missed") return { date: found.date };
  return { refusal: `${CUTOFF_NAMES[cutoff]} is not missed or overdue on this job right now: only a missed cut-off can be dismissed` };
}

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** The job's history field of a dismissal and of taking one back (Shipments → Managers' audit line reads it by this name). */
export const CUTOFF_DISMISSED_FIELD = "cutoffDismissed";

/** The history line of a dismissal: "Closing 16.11.2026: went on the next vessel". */
export const dismissedLine = (cutoff: CutoffKey, date: string, reason: string): string => `${CUTOFF_NAMES[cutoff]} ${czDay(date)}: ${reason}`;

/** The history line of a dismissal taken back: "taken back: Closing 16.11.2026". */
export const takenBackLine = (cutoff: CutoffKey, date: string): string => `taken back: ${CUTOFF_NAMES[cutoff]} ${czDay(date)}`;
