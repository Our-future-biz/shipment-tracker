import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { companyUsers, requireUserEmail, type CompanyUser } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import type { HandOverJobsAnswer, HandOverResult, HandOverSkipped, HandledByCount } from "../interfaces/interfaces";
import {
  ALREADY_SO,
  CHANGED_MEANWHILE,
  HAND_OVER_FIELD,
  HAND_OVER_MAX_IDS_SENT,
  HAND_OVER_MAX_JOBS,
  JOB_NOT_FOUND,
  MAX_HAND_OVER_REASON,
  MIN_HAND_OVER_REASON,
  asShown,
  handOverChange,
  handOverLine,
  listTarget,
  stillAsDecided,
  type HandOverShown,
  type HandOverTarget,
} from "../lib/handOver";
import { PERSON_FIELDS } from "../lib/people";
import { handOverJobsRepository } from "../repositories/handOverJobs.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentService, type StillHolds } from "./shipment.service";

/** What a hand-over asks for, as the request sends it. */
export interface HandOverInput {
  shipmentIds: string[];
  /** The new Handled By (a user's e-mail); left out or "" leaves Handled By as it is - a hand-over never leaves a job with nobody. */
  handledBy?: string;
  /** The new Holiday Cover (a user's e-mail), or "" to clear it; left out leaves it as it is. */
  holidayCover?: string;
  reason: string;
  /**
   * The people each job had in the dialog's preview, by shipment id (mock test S20-123): a job whose
   * Handled By / Holiday Cover is no longer so is left as it is. Left out (or a job missing), not checked.
   */
  shown?: Record<string, HandOverShown>;
}

// Jobs changed side by side: each is its own write turn on its own row, so they do not wait for
// one another - and 200 one after another would keep the manager waiting.
const AT_ONCE = 5;

// Handing many jobs over (lib/handOver), and counting the jobs a person still has before they are
// deactivated. Managers only: the endpoints check the role (requireRole) and hand the manager over
// as `actor`, or their company.
class HandOverService {
  /**
   * Changes Handled By and / or Holiday Cover on each job through the shipment service's update, as
   * the manager - the very write an edit of the two fields on the job makes, so its checks, its
   * history lines and the bell of whoever now covers the job are the same - with one more history
   * line, in the same write turn, saying it was a hand-over and why. The turn checks first that the
   * job still has the people it was read with: one changed meanwhile is left as it is, with no line.
   * A job that can't be changed is left as it is and named with the reason; the others go on.
   */
  async handOver(actor: Actor, input: HandOverInput): Promise<HandOverResult> {
    const reason = (input.reason ?? "").trim();
    const sent = Array.isArray(input.shipmentIds) ? input.shipmentIds : [];
    const tooMany = `At most ${HAND_OVER_MAX_JOBS} jobs can be handed over at once`;
    // Bounded as sent, before anything is done with the list: a job named over and over is not a way past the cap.
    if (sent.length > HAND_OVER_MAX_IDS_SENT) throw APIError.invalidArgument(tooMany);
    const ids = [...new Set(sent)];
    if (ids.length === 0) throw APIError.invalidArgument("Choose at least one job to hand over");
    if (ids.length > HAND_OVER_MAX_JOBS) throw APIError.invalidArgument(tooMany);
    if (reason.length < MIN_HAND_OVER_REASON) throw APIError.invalidArgument("Say why the jobs are handed over");
    if (reason.length > MAX_HAND_OVER_REASON) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_HAND_OVER_REASON} characters)`);
    const givesHandledBy = !!(input.handledBy ?? "").trim();
    const givesCover = input.holidayCover !== undefined;
    if (!givesHandledBy && !givesCover) throw APIError.invalidArgument("Choose a new Handled By, a Holiday Cover, or both");

    // The people are checked once, by the rule the single edit uses: a name that is no user of the
    // company refuses the whole hand-over, rather than every job one by one.
    const users = await this.users();
    const target: HandOverTarget = {
      handledBy: givesHandledBy ? requireUserEmail(input.handledBy, PERSON_FIELDS.personInCharge, users) : null,
      holidayCover: givesCover ? requireUserEmail(input.holidayCover, PERSON_FIELDS.holidayCover, users) : null,
    };

    const skipped: HandOverSkipped[] = [];
    let changed = 0;
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        const outcome = await this.one(actor, id, target, reason, shownOf(input.shown, id));
        if (outcome === null) changed++;
        else skipped.push({ shipmentId: id, ...outcome });
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, ids.length) }, worker));
    // In the order they were asked for, whichever finished first.
    skipped.sort((a, b) => ids.indexOf(a.shipmentId) - ids.indexOf(b.shipmentId));
    return { changed, skipped };
  }

  // One job: null when it was changed, else why it was left as it is. Never throws.
  private async one(actor: Actor, id: string, target: HandOverTarget, reason: string, shown?: HandOverShown): Promise<{ jobNumber: string; why: string } | null> {
    let jobNumber = "";
    try {
      const job = isUuid(id) ? await shipmentRepository.getByIdForCompany(id, actor.companyID) : null;
      if (!job) return { jobNumber, why: JOB_NOT_FOUND };
      jobNumber = job.jobNumber ?? "";
      // Before "already so": a job the preview showed as already so, changed since to somebody else, would
      // otherwise be handed over on top of a change the manager never saw (mock test S20-123).
      if (!asShown(job, shown, target)) return { jobNumber, why: CHANGED_MEANWHILE };
      const change = handOverChange(job, target);
      if (!change) return { jobNumber, why: ALREADY_SO };
      // Checked again in the write turn: the line names `job`'s people as "from", so it is written
      // only while they are still the ones the write replaces (lib/handOver stillAsDecided).
      const asDecided: StillHolds = (current) => {
        if (!stillAsDecided(current, job, change)) throw APIError.aborted(CHANGED_MEANWHILE);
      };
      await shipmentService.update(id, actor.companyID, change, actor.userID, actor.role, undefined, asDecided, {
        history: [{ field: HAND_OVER_FIELD, oldValue: null, newValue: handOverLine(job, change, reason) }],
      });
      return null;
    } catch (err) {
      // A refusal of the edit itself is the reason as the job's own page would give it.
      if (err instanceof APIError) return { jobNumber, why: err.message };
      log.error(err, "hand-over: a job could not be changed", { shipmentId: id });
      return { jobNumber, why: "Could not be changed just now: try this job again" };
    }
  }

  /**
   * How many ACTIVE jobs name this person in Handled By, and how many in Holiday Cover - the Users
   * page's warning before a user is deactivated (D13), so the jobs can be handed over. `email` as
   * sent, any case.
   */
  async handledByCount(companyId: string, email: string): Promise<HandledByCount> {
    const asked = (email ?? "").trim().toLowerCase();
    // "nobody" is the list filter's word for the jobs nobody handles: no person to count.
    if (!asked || asked === "nobody") throw APIError.invalidArgument("email is required: the person's e-mail");
    return shipmentRepository.handledByCounts(companyId, asked);
  }

  /**
   * A person's active jobs by Handled By - or, `as: "holidayCover"`, the jobs they cover (P12) - for handing
   * them all over at once (X9, K18): every one, quiet ones too - not only those the cockpit's cards show - in
   * the mode and direction asked, the oldest first and at most as many as one hand-over takes, with how many
   * there are in all. With the hand-over's `to` chosen, only the jobs it would change (n25): a cover given to
   * 240 jobs whose first 200 have it already lists the other 40. The hand-over itself goes through handOver()
   * as any other. E-mails as sent, any case.
   */
  async jobsOf(
    companyId: string,
    email: string,
    filter: { mode?: string; direction?: string } = {},
    opts: { as?: "handledBy" | "holidayCover"; to?: { handledBy?: string; holidayCover?: string } } = {},
  ): Promise<HandOverJobsAnswer> {
    const asked = (email ?? "").trim().toLowerCase();
    const as = opts.as ?? "handledBy";
    // The jobs nobody handles have nobody to hand them over from: those are handed over one by one, or ticked.
    if (!asked || asked === "nobody") throw APIError.invalidArgument(`${as === "holidayCover" ? "coveredBy" : "handledBy"} is required: the person's e-mail`);
    const who = as === "holidayCover" ? { holidayCover: asked } : { handledBy: asked };
    const { jobs, total } = await handOverJobsRepository.ofPerson(companyId, who, filter, HAND_OVER_MAX_JOBS, listTarget(opts.to));
    return { jobs: jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, handledBy: j.personInCharge, holidayCover: j.holidayCover })), total };
  }

  private async users(): Promise<CompanyUser[]> {
    try {
      return await companyUsers();
    } catch (err) {
      log.warn(err, "hand-over: the company's users could not be read");
      throw APIError.unavailable("The company's users could not be read just now - try again in a moment");
    }
  }
}

// The preview's people for one job, when the page sent them as strings (anything else: not checked).
function shownOf(shown: HandOverInput["shown"], id: string): HandOverShown | undefined {
  const one = shown && Object.prototype.hasOwnProperty.call(shown, id) ? shown[id] : undefined;
  return one && typeof one.handledBy === "string" && typeof one.holidayCover === "string" ? one : undefined;
}

export const handOverService = new HandOverService();
