import { addDays, formatDate } from "@/lib/date";

// What a manager does from Shipments → Managers (Council Outlay 11, step 3): hands jobs over, nudges the people of
// a job, dismisses a missed cut-off - and, on Settings → Users, is told how many jobs still name a person before
// that person is deactivated. The server decides each of them (apps/api shipments lib/handOver, lib/nudge,
// lib/cutoffDismissals); here are only the dialogs' own rules and words, so they say what the server will do.

/** A reason is asked for with every action: at least this many characters (the server's rule). */
export const MIN_ACTION_REASON = 3;
export const MAX_ACTION_REASON = 500;
export const actionReasonOk = (reason: string): boolean => reason.trim().length >= MIN_ACTION_REASON;

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const personEmail = (value: string | null | undefined) => (value ?? "").split(" — ")[0]!.trim().toLowerCase();

// ── Hand-over (D11) ──

/** The most jobs one hand-over takes (the server's limit). */
export const HAND_OVER_MAX_JOBS = 200;

/** A job as the hand-over dialog gets it: its people as stored. */
export interface HandOverJob {
  id: string;
  jobNumber: string;
  handledBy: string;
  holidayCover: string;
}

/** What the dialog's Holiday Cover choice is: left alone, set to somebody, or cleared. */
export type CoverChoice = "leave" | "set" | "clear";

/** What was picked in the dialog: `handledBy` "" leaves Handled By as it is. */
export interface HandOverChoice {
  handledBy: string;
  cover: CoverChoice;
  holidayCover: string;
}

/** Whom the jobs go to, as the server reads it: null leaves the field, "" clears the cover. */
export interface HandOverTarget {
  handledBy: string | null;
  holidayCover: string | null;
}

export function handOverTarget(choice: HandOverChoice): HandOverTarget {
  const handledBy = personEmail(choice.handledBy) || null;
  const cover = personEmail(choice.holidayCover);
  return { handledBy, holidayCover: choice.cover === "clear" ? "" : choice.cover === "set" && cover ? cover : null };
}

/** Why the hand-over cannot be sent yet, or null (the reason is checked on its own: actionReasonOk). */
export function handOverProblem(choice: HandOverChoice, jobs: number): string | null {
  if (jobs === 0) return "No job is chosen";
  if (jobs > HAND_OVER_MAX_JOBS) return `At most ${HAND_OVER_MAX_JOBS} jobs go in one hand-over (${jobs} are chosen): choose fewer`;
  if (choice.cover === "set" && !personEmail(choice.holidayCover)) return "Pick who covers, or leave the Holiday Cover as it is";
  const target = handOverTarget(choice);
  if (target.handledBy === null && target.holidayCover === null) return "Choose a new Handled By, a Holiday Cover, or both";
  return null;
}

/** One field of one job in the preview: what it holds and what it will hold. */
export interface HandOverFieldChange {
  from: string;
  to: string;
}

/** What the hand-over does to one job; both null when it is already so (the server then skips it). */
export interface HandOverPreviewRow {
  job: HandOverJob;
  handledBy: HandOverFieldChange | null;
  holidayCover: HandOverFieldChange | null;
}

/**
 * What will change, job by job. A person is compared by e-mail, as the server compares (an old value with a
 * name after it counts as that person), so the preview and the answer agree on what is "already so".
 */
export function handOverPreview(jobs: readonly HandOverJob[], target: HandOverTarget): HandOverPreviewRow[] {
  return jobs.map((job) => ({
    job,
    handledBy: target.handledBy !== null && personEmail(job.handledBy) !== target.handledBy ? { from: job.handledBy.trim(), to: target.handledBy } : null,
    holidayCover:
      target.holidayCover !== null && personEmail(job.holidayCover) !== target.holidayCover ? { from: job.holidayCover.trim(), to: target.holidayCover } : null,
  }));
}

/** How many jobs of a preview change at all. */
export const handOverChanging = (rows: readonly HandOverPreviewRow[]): number => rows.filter((r) => r.handledBy || r.holidayCover).length;

/** The request: a field left alone is left out, so the server leaves it alone too. */
export function handOverRequest(
  jobs: readonly HandOverJob[],
  target: HandOverTarget,
  reason: string,
): { shipmentIds: string[]; handledBy?: string; holidayCover?: string; reason: string } {
  return {
    shipmentIds: jobs.map((j) => j.id),
    ...(target.handledBy !== null ? { handledBy: target.handledBy } : {}),
    ...(target.holidayCover !== null ? { holidayCover: target.holidayCover } : {}),
    reason: reason.trim(),
  };
}

const jobsWord = (n: number) => `${n} job${n === 1 ? "" : "s"}`;

/** The answer in one sentence: "3 jobs handed over, 1 left as it was". */
export function handOverResultText(result: { changed: number; skipped: readonly unknown[] }): string {
  const changed = result.changed > 0 ? `${jobsWord(result.changed)} handed over` : "No job was changed";
  const left = result.skipped.length;
  return left > 0 ? `${changed}, ${left} left as ${left === 1 ? "it was" : "they were"}` : changed;
}

// ── Nudge (D17) ──

/** The longest to-do a nudge takes (the server's limit). */
export const NUDGE_MAX_TEXT = 300;

/**
 * The working day after `day` (YYYY-MM-DD): Saturdays and Sundays are skipped. Only the dialog's first offer of a
 * due date - public holidays are not looked up for it, and the manager picks any day from today on.
 */
export function nextWorkingDay(day: string): string {
  let next = addDays(day, 1);
  while ([0, 6].includes(new Date(`${next}T00:00:00Z`).getUTCDay())) next = addDays(next, 1);
  return next;
}

/** Why the nudge cannot be sent yet, or null. `today` is the company's day (the server refuses an earlier one). */
export function nudgeProblem(nudge: { text: string; dueDate: string; handledBy: string }, today: string): string | null {
  if (!personEmail(nudge.handledBy)) return "Name somebody in Handled By first";
  if (!nudge.text.trim()) return "Say what has to be done";
  if (nudge.text.trim().length > NUDGE_MAX_TEXT) return `At most ${NUDGE_MAX_TEXT} characters`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nudge.dueDate)) return "Say by when it has to be done";
  if (nudge.dueDate < today) return "The due date has passed: choose today or a later day";
  return null;
}

/**
 * Who was told of a nudge: the job's Handled By and Holiday Cover as far as they are users, tagged in the chat
 * line. The server refuses a nudge nobody could be told of, so there is always somebody.
 */
export const nudgeToldText = (told: readonly string[]): string => `Told under the bell: ${told.join(", ") || "nobody"}`;

// ── Dismissing a missed cut-off ──

export const CUTOFF_KEYS = ["closingDate", "vgmClosing", "siClosing", "amsDeadline", "isfDeadline"] as const;
export type CutoffKey = (typeof CUTOFF_KEYS)[number];

/** What a cut-off is called (the server's own names of them). */
export const CUTOFF_NAMES: Record<CutoffKey, string> = {
  closingDate: "Closing",
  vgmClosing: "VGM",
  siClosing: "SI",
  amsDeadline: "AMS",
  isfDeadline: "ISF",
};

/** A cut-off's name by its key; the key itself when it is none of the five. */
export const cutoffName = (key: string): string => CUTOFF_NAMES[key as CutoffKey] ?? key;

/** A standing dismissal in one line: "Closing 16.11.2026". */
export const dismissalTitle = (d: { cutoff: string; cutoffDate: string }): string => `${cutoffName(d.cutoff)} ${formatDate(d.cutoffDate)}`.trim();

// ── Settings → Users: the jobs a person still handles (D13) ──

export const HANDLED_BY_COUNT_NOT_READ = "How many jobs this person handles could not be read";
export const HANDLES_NO_JOB = "No active job names this person in Handled By or Holiday Cover.";

/**
 * The warning before a user is deactivated, or null when no active job names them. The deactivation is never
 * held up by it: the jobs stay with the person, URGENT on Shipments → Managers, until a manager hands them over.
 */
export function handledByWarning(count: { handledBy: number; covers: number }): string | null {
  const { handledBy: n, covers: m } = count;
  if (n <= 0 && m <= 0) return null;
  const one = n === 1 && m <= 0;
  return `${n} active job${n === 1 ? " names" : "s name"} this person in Handled By (${m} as Holiday Cover): ${one ? "it stays" : "they stay"} URGENT on Shipments → Managers until handed over`;
}

/** Shipments → Managers narrowed to the jobs a person handles (the page's own ?handledBy=). */
export const handledByJobsHref = (email: string): string => `/shipments/managers?handledBy=${encodeURIComponent(email.trim().toLowerCase())}`;
