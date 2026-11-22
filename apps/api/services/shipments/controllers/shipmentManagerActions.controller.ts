import { api, type Query } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { HandOverJobsAnswer, HandOverResult, HandledByCount, NudgeResult } from "../interfaces/interfaces";
import { handOverService } from "../services/handOver.service";
import { nudgeService } from "../services/nudge.service";

// What a manager does from Shipments → Managers (Council Outlay 11, step 3): hands jobs over, nudges the
// people of a job, and - before a user is deactivated - sees how many active jobs still name them; it
// also lists a person's active jobs to hand them all over at once (X9). All for superadmins, admins and managers.

const managers = () => requireRole("superadmin", "admin", "manager");

interface ShipmentHandOverRequest {
  /** The jobs to hand over: 1 to 200 shipment ids (a list of more than 1,000 entries is refused unread). */
  shipmentIds: string[] & MaxLen<1000>;
  /** The new Handled By: the e-mail of a user of the company. Left out (or ""), Handled By stays as it is. */
  handledBy?: string & MaxLen<320>;
  /** The new Holiday Cover: the e-mail of a user of the company, or "" to clear it. Left out, it stays as it is. */
  holidayCover?: string & MaxLen<320>;
  /** Why (at least 3 characters): kept in each job's history. */
  reason: string & MaxLen<500>;
  /**
   * What the dialog's preview showed for each job, by shipment id (mock test S20-123). A job whose Handled By /
   * Holiday Cover (whichever the hand-over writes) is no longer so is left as it is, in `skipped` with "Changed
   * by somebody else meanwhile". Left out, or a job missing from it, that job is not checked. Only the jobs in
   * `shipmentIds` are read from it; more than 1,000 entries are refused, as the list is.
   */
  shown?: Record<string, HandOverShownPeople>;
}

/** A job's people as the hand-over dialog showed them: as stored, "" for nobody. */
interface HandOverShownPeople {
  handledBy: string & MaxLen<1000>;
  holidayCover: string & MaxLen<1000>;
}

// D11. Each job is changed as an edit of the two fields on the job itself changes it; a job that
// can't be changed is answered in `skipped` with the reason, and the others go on.
export const shipmentHandOver = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/hand-over" },
  async (req: ShipmentHandOverRequest): Promise<HandOverResult> => {
    return handOverService.handOver(managers(), req);
  },
);

interface HandOverJobsRequest {
  /** Whose jobs: the e-mail Handled By names (any case). Left out when `coveredBy` is sent. */
  handledBy?: Query<string> & MaxLen<320>;
  /** Or the jobs this person covers: the e-mail Holiday Cover names (any case) - "Replace as Holiday Cover…" (P12). */
  coveredBy?: Query<string> & MaxLen<320>;
  /** sea | air | rail | road; left out or "all" for every mode - as the Shipments list's filter. */
  mode?: Query<string> & MaxLen<10>;
  /** import | export | domestic; left out or "all" for every direction. */
  direction?: Query<string> & MaxLen<10>;
  /** The new Handled By chosen in the dialog: only the jobs it changes are listed (n25). Left out or "", none chosen. */
  toHandledBy?: Query<string> & MaxLen<320>;
  /** The new Holiday Cover chosen, "" to clear it: only the jobs it changes are listed. Left out, none chosen. */
  toHolidayCover?: Query<string> & MaxLen<320>;
}

// X9 (K18). A person's active jobs by Handled By - quiet ones too, not only the jobs with a signal on
// the cards - for "Hand over all N active jobs…" on a Team row, or the jobs they cover for "Replace as
// Holiday Cover…" (P12): at most 200 (as many as one hand-over takes), the oldest first, and how many there
// are in all. Once a new Handled By or Holiday Cover is chosen, only the jobs it would change (n25), so jobs
// past the first 200 are reached when those are already so. The hand-over itself is POST /shipments/hand-over.
export const shipmentHandOverJobs = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/hand-over/jobs" },
  async ({ handledBy, coveredBy, mode, direction, toHandledBy, toHolidayCover }: HandOverJobsRequest): Promise<HandOverJobsAnswer> => {
    const companyId = managers().companyID;
    const to = { handledBy: toHandledBy, holidayCover: toHolidayCover };
    if (coveredBy !== undefined && !handledBy) return handOverService.jobsOf(companyId, coveredBy, { mode, direction }, { as: "holidayCover", to });
    return handOverService.jobsOf(companyId, handledBy ?? "", { mode, direction }, { to });
  },
);

interface ShipmentNudgeRequest {
  shipmentId: string;
  /** The to-do's title. */
  text: string & MaxLen<300>;
  /** By when: YYYY-MM-DD, today or later. */
  dueDate: string & MaxLen<10>;
}

// D17. A to-do on the job and a chat line tagging its Handled By and Holiday Cover. No e-mail.
// Refused when nobody on the job can be told ("Nobody on this job can be told: hand it over first").
export const shipmentNudge = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/nudge" },
  async ({ shipmentId, ...input }: ShipmentNudgeRequest): Promise<NudgeResult> => {
    return nudgeService.nudge(managers(), shipmentId, input);
  },
);

interface HandledByCountRequest {
  /** The person's e-mail, as Handled By stores it (any case). */
  email: Query<string>;
}

// D13. How many ACTIVE jobs name this person - the Users page's warning before a user is
// deactivated. The e-mail is matched as the Shipments list's Handled By filter matches it.
export const shipmentHandledByCount = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/handled-by-count" },
  async ({ email }: HandledByCountRequest): Promise<HandledByCount> => {
    return handOverService.handledByCount(managers().companyID, email);
  },
);
