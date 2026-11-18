// Stock → release to a truck, several jobs at once: which of them a manager's typed reason goes with. A reason is
// an override of the prepayment stop, recorded with the job it is sent with - so it goes ONLY with the jobs the
// stop holds (or may hold) and nothing else lets through. A job a manager approved on request (Council Outlay 11,
// D16) is released on that approval, with its own two reasons: sent the typed reason as well, it would be released
// as this manager's own override, under another job's reason, and its approval closed unused. A job the stop does
// not hold gets none either. Pure: the dialog gives what it knows of each job, the move sends what comes out.

/** One of the jobs being released, as the dialog knows it at the moment of the release. */
export interface ReleaseJob {
  shipmentId: string;
  /** The payment check says the job is held for prepayment (not paid): the server stops it. */
  held: boolean;
  /** The payment check could not be made: the server may stop it as "not checked". */
  unchecked: boolean;
  /** The server stopped it on the last try. */
  stopped: boolean;
  /** A manager's approval of a request lets it through, as far as it was read. */
  pass: boolean;
}

/**
 * How the dialog shows a job:
 *   on_approval     held, stopped or not checked - and a manager's approval stands: it goes through on that
 *   stopped         the server stopped it on the last try
 *   likely_stopped  the check says it will be stopped
 *   unchecked       its payment could not be checked: the server decides
 *   free            nothing holds it
 */
export type ReleaseStanding = "on_approval" | "stopped" | "likely_stopped" | "unchecked" | "free";

export function releaseStanding(job: ReleaseJob): ReleaseStanding {
  const mayStop = job.stopped || job.held || job.unchecked;
  if (mayStop && job.pass) return "on_approval";
  if (job.stopped) return "stopped";
  if (job.held) return "likely_stopped";
  return job.unchecked ? "unchecked" : "free";
}

/** Whether the job's release needs somebody's leave before it is tried: an approval is looked for only for these. */
export const mayBeStopped = (job: Pick<ReleaseJob, "held" | "unchecked" | "stopped">): boolean => job.stopped || job.held || job.unchecked;

/** Whether a manager's typed reason goes with this job: the stop holds it, or may, and no approval lets it through. */
export function takesOverrideReason(job: ReleaseJob): boolean {
  const standing = releaseStanding(job);
  return standing === "stopped" || standing === "likely_stopped" || standing === "unchecked";
}

/** The typed reason per job (shipment id → reason): only for the jobs that take it; empty when nothing was typed. */
export function overrideReasons(jobs: readonly ReleaseJob[], reason: string | null | undefined): Map<string, string> {
  const typed = (reason ?? "").trim();
  return new Map(typed ? jobs.filter(takesOverrideReason).map((j) => [j.shipmentId, typed] as const) : []);
}

/** One job's write: the move's own fields, and the manager's reason only when this job is given one. */
export function withOverrideReason<T extends object>(data: T, shipmentId: string, reasons: ReadonlyMap<string, string> | undefined): T & { paymentOverrideReason?: string } {
  const reason = (reasons?.get(shipmentId) ?? "").trim();
  return reason ? { ...data, paymentOverrideReason: reason } : data;
}

/** Every job the stop holds goes through on a manager's approval (and there is one): the button then says so. */
export function everyHeldOnApproval(jobs: readonly ReleaseJob[]): boolean {
  const heldJobs = jobs.filter((j) => j.held || j.stopped);
  return heldJobs.length > 0 && heldJobs.every((j) => releaseStanding(j) === "on_approval");
}
