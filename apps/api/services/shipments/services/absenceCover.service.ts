import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth, shipments } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { isUniqueViolation } from "../../../lib/db/errors";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";
import type { AbsenceCoverAbsence, AbsenceCoverResult } from "../interfaces/interfaces";
import {
  ABSENCE_COVER_FIELD,
  ABSENCE_COVER_JOBS_PER_RUN,
  coverClearedLine,
  coverSetLine,
  emailKey,
  planOpenCovers,
  setDecision,
  standingCovers,
  type ClearWhy,
  type CoverAbsence,
  type OpenCover,
} from "../lib/absenceCover";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { INVOICED_STATUS } from "../lib/jobNumber";
import { personEmail } from "../lib/shipmentEditRule";
import { shipmentAbsenceCoverRepository as covers } from "../repositories/shipmentAbsenceCover.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import type { ShipmentAbsenceCoverRecord } from "../schemas/shipmentAbsenceCover.schema";
import { shipmentService, type StillHolds } from "./shipment.service";

// The dated Holiday Cover (Council Outlay 11, D12; lib/absenceCover). Every 15 minutes the cron asks
// auth for the absences of every company in force today (and ended lately), and runs each company
// that has one - or a cover still to clear - as that company's service identity: no person is
// behind a clock, and the shipment service's update is the very write an edit of Holiday Cover on
// the job makes (its checks, its history line, the bell of the cover). Each change also leaves a
// line of its own saying why. Safe to run twice at once: the job's write turn checks again that
// the job is as decided (StillHolds), and the rows are unique per absence and job.

/** The refusal of a job's write that found the job changed meanwhile: the job is left as somebody made it. */
export const CHANGED_MEANWHILE = "The job's Handled By or Holiday Cover changed meanwhile";

const isActive = (job: { status: string; invoicingStatus: string }) => job.status !== CANCELLED_STATUS && job.invoicingStatus !== INVOICED_STATUS;

/** The write turn's check before a cover is set: still the absent user's active job, still with no Holiday Cover. */
const stillUncovered =
  (absentEmail: string): StillHolds =>
  (current) => {
    if (personEmail(current.holidayCover) || personEmail(current.personInCharge) !== emailKey(absentEmail) || !isActive(current)) throw APIError.aborted(CHANGED_MEANWHILE);
  };

/** The write turn's check before a cover is cleared: the job still holds the e-mail set. */
const stillHolding =
  (coverEmail: string): StillHolds =>
  (current) => {
    if (personEmail(current.holidayCover) !== emailKey(coverEmail)) throw APIError.aborted(CHANGED_MEANWHILE);
  };

const toOpen = (r: ShipmentAbsenceCoverRecord): OpenCover => ({
  id: r.id,
  absenceId: r.absenceId,
  shipmentId: r.shipmentId,
  absentUserId: r.absentUserId,
  absentEmail: r.absentEmail,
  absentName: r.absentName,
  fromDate: r.fromDate,
  toDate: r.toDate,
  coverEmail: r.coverEmail,
  setAt: r.setAt,
});

const changedMeanwhile = (err: unknown) => err instanceof APIError && err.message === CHANGED_MEANWHILE;
const jobGone = (err: unknown) => err instanceof APIError && err.code === "not_found";

class AbsenceCoverService {
  /**
   * One company's run, as its service identity (`actor`): first the covers to clear - ended,
   * shortened, deleted or another cover named - then the covers to set, at most
   * ABSENCE_COVER_JOBS_PER_RUN jobs written in all; the rest by the next run. `absences`: the
   * company's, as auth tells them now.
   */
  async applyForCompany(actor: { companyID: string; userID: string }, absences: readonly CoverAbsence[], now = new Date()): Promise<AbsenceCoverResult> {
    const companyId = actor.companyID;
    const result: AbsenceCoverResult = { set: 0, cleared: 0, left: 0, moved: 0, failed: 0 };
    let budget = ABSENCE_COVER_JOBS_PER_RUN;

    for (const plan of planOpenCovers((await covers.openOfCompany(companyId)).map(toOpen), absences)) {
      if (plan.action === "keep") continue;
      if (plan.action === "move") {
        try {
          await covers.moveTo(companyId, plan.row.id, plan.to);
          result.moved++;
        } catch (err) {
          if (isUniqueViolation(err)) {
            // The next absence has a row of its own on the job already: that row answers for the job's cover
            // from now on (it clears it when that absence ends), and this one is done - not tried every run.
            if (await covers.close(companyId, plan.row.id, "changed", now)) result.left++;
          } else {
            log.warn(err, "absence cover: a row could not go over to the next absence", { companyId, row: plan.row.id });
          }
        }
        continue;
      }
      if (budget <= 0) break;
      budget--;
      const outcome = await this.#clear(actor, plan.row, plan.why, now);
      if (outcome === "cleared") result.cleared++;
      else if (outcome === "left") result.left++;
      else result.failed++;
    }

    for (const absence of standingCovers(absences)) {
      if (budget <= 0) break;
      const coverEmail = absence.coverEmail!;
      for (const job of await covers.jobsToCover(companyId, absence.userEmail, { id: absence.id, coverEmail }, budget)) {
        if (budget <= 0) break;
        if (setDecision(await covers.openOf(companyId, absence.id, job.id), coverEmail) !== "set") continue;
        budget--;
        const outcome = await this.#set(actor, absence, job.id, now);
        if (outcome === "set") result.set++;
        else if (outcome === "failed") result.failed++;
      }
    }
    return result;
  }

  // Sets the absence's cover on one job. The row comes first, so a run that stops before the job's write leaves
  // a row to close. The row is then marked set in that write's own turn.
  async #set(actor: { companyID: string; userID: string }, absence: CoverAbsence, shipmentId: string, now: Date): Promise<"set" | "skipped" | "failed"> {
    const companyId = actor.companyID;
    const coverEmail = absence.coverEmail!;
    const row = await covers.ensureOpen({
      companyId,
      absenceId: absence.id,
      shipmentId,
      absentUserId: absence.userId,
      absentEmail: emailKey(absence.userEmail),
      absentName: absence.userName,
      fromDate: absence.fromDate,
      toDate: absence.toDate,
      coverEmail: emailKey(coverEmail),
    });
    // Another run's row of another cover, or one set already (somebody cleared it since): left as it is.
    if (!row || setDecision(row, coverEmail) !== "set") return "skipped";
    const line = coverSetLine(emailKey(coverEmail), { name: absence.userName, email: absence.userEmail }, absence.fromDate, absence.toDate);
    try {
      await shipmentService.update(shipmentId, companyId, { holidayCover: coverEmail }, actor.userID, undefined, undefined, stillUncovered(absence.userEmail), {
        history: [{ field: ABSENCE_COVER_FIELD, oldValue: null, newValue: line }],
        // Marked in the job's write turn, with the cover: a failure after the commit (a read the update makes
        // afterwards, a crash) never leaves a cover whose row says it was not set, which #clear would take
        // for somebody's own and leave for good. A row closed meanwhile refuses the write, as nothing would clear it.
        alongside: async (tx) => {
          if (!(await covers.markSet(tx, companyId, row.id, now))) throw APIError.aborted(CHANGED_MEANWHILE);
        },
      });
      return "set";
    } catch (err) {
      // Changed meanwhile (or its row closed), or gone: nothing to set. An open row is closed once the absence ends.
      if (changedMeanwhile(err) || jobGone(err)) return "skipped";
      log.warn(err, "absence cover: a job's Holiday Cover could not be set", { companyId, shipmentId, absenceId: absence.id });
      return "failed";
    }
  }

  // Clears the cover a row set, where the job still holds it; the row is closed either way, but when the write failed.
  async #clear(actor: { companyID: string; userID: string }, row: OpenCover, why: ClearWhy, now: Date): Promise<"cleared" | "left" | "failed"> {
    const companyId = actor.companyID;
    const close = async (outcome: "cleared" | "changed" | "gone") => {
      await covers.close(companyId, row.id, outcome, now);
      return outcome === "cleared" ? "cleared" : "left";
    };
    try {
      // A row is marked set in the very write turn that sets its cover (#set), so one not marked never set
      // the job's cover: the same e-mail on the job now is somebody's own doing (typed by hand meanwhile), and stays.
      if (!row.setAt) return await close("changed");
      const job = await shipmentRepository.getByIdForCompany(row.shipmentId, companyId);
      if (!job) return await close("gone");
      if (personEmail(job.holidayCover) !== emailKey(row.coverEmail)) return await close("changed");
      const line = coverClearedLine(row.coverEmail, { name: row.absentName, email: row.absentEmail }, why);
      await shipmentService.update(row.shipmentId, companyId, { holidayCover: "" }, actor.userID, undefined, undefined, stillHolding(row.coverEmail), {
        history: [{ field: ABSENCE_COVER_FIELD, oldValue: null, newValue: line }],
      });
      return await close("cleared");
    } catch (err) {
      if (changedMeanwhile(err)) return close("changed").catch(() => "failed" as const);
      if (jobGone(err)) return close("gone").catch(() => "failed" as const);
      log.warn(err, "absence cover: a job's Holiday Cover could not be cleared", { companyId, shipmentId: row.shipmentId, row: row.id });
      return "failed";
    }
  }
}

export const absenceCoverService = new AbsenceCoverService();

/** What a run over every company did. */
export interface AbsenceCoverRun extends AbsenceCoverResult {
  /** Companies run. */
  companies: number;
  /** Of those, how many failed as a whole (logged; tried again by the next run). */
  companiesFailed: number;
}

/**
 * The cron's run: the absences of every company from auth - when auth does not answer nothing is
 * done, so no cover is cleared on a guess - and each company that has one, or a cover still to
 * clear, run as its service identity (an internal call of this service, so everything the job's
 * write asks of other services is asked as that company).
 */
export async function runAbsenceCovers(now = new Date()): Promise<AbsenceCoverRun> {
  const day = businessDay(now);
  const { absences } = await auth._internalAbsencesInForce({ day });
  const companies = [...new Set([...absences.map((a) => a.companyId), ...(await covers.companiesWithOpen())])];
  const total: AbsenceCoverRun = { companies: companies.length, companiesFailed: 0, set: 0, cleared: 0, left: 0, moved: 0, failed: 0 };
  for (const companyId of companies) {
    try {
      const own: AbsenceCoverAbsence[] = absences
        .filter((a) => a.companyId === companyId)
        .map((a) => ({ id: a.id, companyId: a.companyId, userId: a.userId, userEmail: a.userEmail, userName: a.userName, fromDate: a.fromDate, toDate: a.toDate, inForce: a.inForce, coverEmail: a.coverEmail }));
      const done = await shipments._internalAbsenceCover({ absences: own }, { authData: await serviceActor(companyId) });
      total.set += done.set;
      total.cleared += done.cleared;
      total.left += done.left;
      total.moved += done.moved;
      total.failed += done.failed;
    } catch (err) {
      // One company's failure never stops the others.
      total.companiesFailed++;
      log.warn(err, "absence cover: a company's run failed", { companyId });
    }
  }
  return total;
}

/** How often the cover job runs (the cron's schedule and the local timer). */
export const ABSENCE_COVER_EVERY_MS = 15 * 60_000;
let started = false;

// Encore cron jobs do not fire under `encore run`, so a timer does the same job locally (as the
// outboxes do). In the cloud both run; a run twice at once does each change once.
export function startAbsenceCoverTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void runAbsenceCovers().catch((err) => log.warn(err, "absence cover: the run failed")), ABSENCE_COVER_EVERY_MS).unref();
}
