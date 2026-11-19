// The dated Holiday Cover (Council Outlay 11, D12): while a user is away with a cover named (auth's
// absences), each of their active jobs with no Holiday Cover takes that cover; once the absence
// ended, was shortened or deleted - or names another cover - the cover is cleared again on the
// jobs it was set on, only where the job still holds the e-mail set (somebody may have changed it
// since). Pure: what the cover job does with each absence and each row it keeps
// (schemas/shipmentAbsenceCover.schema); services/absenceCover.service reads and writes, through
// the shipment service's update - the very write an edit of Holiday Cover on the job makes.
// Tested in tests/absenceCover.test.ts.

/** The job's history field of the cover job's lines. */
export const ABSENCE_COVER_FIELD = "absenceCover";
/** The most jobs one run sets or clears a cover on, per company; the rest are done by the next run (every 15 minutes). */
export const ABSENCE_COVER_JOBS_PER_RUN = 200;

/** An absence as the cover job reads it (auth's absences in force or ended lately). */
export interface CoverAbsence {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  fromDate: string;
  toDate: string;
  /** It covers today. */
  inForce: boolean;
  /** The cover's e-mail; null for none, or a cover who is no user any more. */
  coverEmail: string | null;
}

/** A row of a cover the job set, or is about to set, and has not cleared. */
export interface OpenCover {
  id: string;
  absenceId: string;
  shipmentId: string;
  absentUserId: string;
  absentEmail: string;
  absentName: string;
  fromDate: string;
  toDate: string;
  coverEmail: string;
  /** When the job's write went through; null while it is still to. */
  setAt: Date | null;
}

/** An e-mail as compared: trimmed, lower case. */
export const emailKey = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** The absences whose cover is to be set now: in force, with a cover who is not the absent user. */
export const standingCovers = (absences: readonly CoverAbsence[]): CoverAbsence[] =>
  absences.filter((a) => a.inForce && emailKey(a.coverEmail) !== "" && emailKey(a.coverEmail) !== emailKey(a.userEmail));

/**
 * Why a cover is cleared: the absence is over (it ended, was shortened or deleted - which says nothing
 * of whether the user is back: they may have started another absence), the user it was for is no
 * longer a user of the company, or an absence of theirs in force names another cover now (or none).
 */
export type ClearWhy = "over" | "left" | "changed";

/** What the run does with an open row. */
export type OpenCoverPlan =
  | { row: OpenCover; action: "keep" }
  /** The user's next absence, adjacent, names the same cover: the row goes over to it, the job is left as it is. */
  | { row: OpenCover; action: "move"; to: CoverAbsence }
  | { row: OpenCover; action: "clear"; why: ClearWhy };

/**
 * Each open row against the absences as auth tells them now. Its absence still in force with the
 * same cover: kept. Otherwise - ended, shortened, deleted (not told at all), its user gone, or
 * another cover named - cleared; unless another absence of the same user, in force, names the same
 * cover (one absence followed by the next): then the row goes over to it and the job keeps its cover.
 */
export function planOpenCovers(open: readonly OpenCover[], absences: readonly CoverAbsence[]): OpenCoverPlan[] {
  const standing = standingCovers(absences);
  return open.map((row): OpenCoverPlan => {
    const own = absences.find((a) => a.id === row.absenceId);
    const cover = emailKey(row.coverEmail);
    if (own && standing.includes(own) && emailKey(own.coverEmail) === cover) return { row, action: "keep" };
    const next = standing.find((a) => a.id !== row.absenceId && a.userId === row.absentUserId && emailKey(a.coverEmail) === cover);
    if (next) return { row, action: "move", to: next };
    // Away still - on this absence or another one that names another cover, or none: the cover changed.
    const awayStill = absences.some((a) => a.inForce && a.userId === row.absentUserId);
    return { row, action: "clear", why: awayStill ? "changed" : "over" };
  });
}

/**
 * Why a cover is cleared, with whether its user is still a user of the company (`liveUserIds`: the
 * company's users now; null when they could not be read). An absence that is over because its user
 * left - auth tells no absences of a user who is gone - is said so; not known, it is just over.
 */
export function clearWhy(why: ClearWhy, absentUserId: string, liveUserIds: ReadonlySet<string> | null): ClearWhy {
  return why === "over" && liveUserIds !== null && !liveUserIds.has(absentUserId) ? "left" : why;
}

/** What the run does with a job of an absent user that has no Holiday Cover. */
export type SetDecision = "set" | "already_set_once" | "other_cover_open";

/**
 * Whether the cover is set on a job with no Holiday Cover, given the job's open row for this
 * absence (null for none): set unless the job's cover was set once already for the absence - then
 * somebody cleared it by hand since, and that stands - or a row of another cover is still to be
 * cleared (the next run sets the new one).
 */
export function setDecision(row: Pick<OpenCover, "coverEmail" | "setAt"> | null, coverEmail: string): SetDecision {
  if (!row) return "set";
  if (emailKey(row.coverEmail) !== emailKey(coverEmail)) return "other_cover_open";
  return row.setAt ? "already_set_once" : "set";
}

/** "19.11." of a YYYY-MM-DD day. */
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
/** The absent user as a line names them: their name, else their e-mail. */
export const absentWho = (a: { name: string; email: string }) => a.name.trim() || a.email.trim() || "the user";

/** The job's history line of a cover set: "Holiday Cover eva@firma.cz while Jan Novák is away 23.11.–27.11.". */
export const coverSetLine = (cover: string, absent: { name: string; email: string }, fromDate: string, toDate: string) =>
  `Holiday Cover ${cover} while ${absentWho(absent)} is away ${dm(fromDate)}–${dm(toDate)}`;

/**
 * The job's history line of a cover cleared, in words that claim nothing the job cannot know (m26):
 * "Holiday Cover eva@firma.cz cleared: absence over" - not "Jan is back", as he may have started
 * another absence -, "…: Jan Novák left the company", "…: the cover while Jan Novák is away changed".
 */
export function coverClearedLine(cover: string, absent: { name: string; email: string }, why: ClearWhy): string {
  const head = `Holiday Cover ${cover} cleared`;
  if (why === "left") return `${head}: ${absentWho(absent)} left the company`;
  if (why === "changed") return `${head}: the cover while ${absentWho(absent)} is away changed`;
  return `${head}: absence over`;
}

/**
 * Who the History tab and the audit name for the cover job's writes (m26). They are written as the
 * company's service identity - the same one Trucking's writes are made as, named "Trucking (system)" -
 * so a change saved with one of the job's lines (ABSENCE_COVER_FIELD) is named this instead.
 */
export const ABSENCE_COVER_ACTOR = "Holiday Cover (automatic)";
