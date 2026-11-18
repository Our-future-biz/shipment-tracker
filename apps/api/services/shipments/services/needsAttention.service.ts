import log from "encore.dev/log";
import { businessDay } from "../../../lib/businessDate";
import type { ShipmentsNeedingAttention } from "../interfaces/interfaces";
import { opsDay, timelineFactsOf, type TimelineEvent, type TimelineFacts } from "../lib/managersCockpit";
import { CARGO_IN_EVENT_KINDS, NEEDS_ATTENTION_JOB_LIMIT, candidateRange, closingToCheck, needsAttentionOf, urgentIds, type DueJob } from "../lib/needsAttention";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import { companyHolidays } from "./companyHolidays";

/** What the page shows after "Not known right now:" when the jobs' tracking events could not be read. */
export const CLOSING_NOT_KNOWN = "tracking events (whether the cargo made its Closing)";

/**
 * What the jobs' timelines say about the cargo being in (lib/managersCockpit timelineFactsOf over
 * the picked-up, loaded and gate-in events alone), by shipment id; a job with no such event has
 * no entry.
 */
async function timelineOf(ids: readonly string[], companyId: string): Promise<Map<string, TimelineFacts>> {
  const events = await shipmentTrackingEventRepository.factsOfKinds(ids, companyId, CARGO_IN_EVENT_KINDS);
  const byJob = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const list = byJob.get(event.shipmentId);
    if (list) list.push(event);
    else byJob.set(event.shipmentId, [event]);
  }
  return new Map([...byJob].map(([id, rows]) => [id, timelineFactsOf(rows)]));
}

// The Shipments list's Needs Attention: the company's active jobs with a date around today, the
// company's holidays and - for the jobs whose Closing may count - whether their timelines show
// the cargo is in, judged by the pure rules of lib/needsAttention (the cockpit's own cut-off rule
// and windows) on one `now`. It only reads. The two cards, the Overview tile's count and the list
// the tile opens all ask here, so they name the same jobs.
//
// One computation: the holidays (one call to the holidays service), the jobs (one narrow query),
// and one narrow query of three kinds of tracking events for the few jobs with an open Closing -
// none when there is no such job. The holidays and the events may fail on their own, and the
// answer says so: working days then skip weekends and the statutory holidays only; a Closing
// still ahead is listed by its date and "Closing missed" is not said.
//
// Callers of one company that arrive while its computation is pending share it - a page load asks
// for the cards and for the tile's count at once, and gets one. Nothing is kept once it is
// answered: the next request computes again, so an edit shows at once.
class NeedsAttentionService {
  private readonly pending = new Map<string, Promise<ShipmentsNeedingAttention>>();

  /**
   * The two lists, as of now - shared with whoever asked for this company a moment ago and is
   * still waiting. With `now` given it is worked out for that instant, for this caller alone.
   * What it returns may be another caller's too: it is read, never changed.
   */
  lists(companyId: string, now?: Date): Promise<ShipmentsNeedingAttention> {
    if (now) return this.compute(companyId, now);
    const waiting = this.pending.get(companyId);
    if (waiting) return waiting;
    const started = this.compute(companyId, new Date()).finally(() => {
      if (this.pending.get(companyId) === started) this.pending.delete(companyId);
    });
    this.pending.set(companyId, started);
    return started;
  }

  /** The ids of the jobs on the URGENT list: what the Overview tile "Needs Attention" counts and its list shows. */
  async urgentIds(companyId: string, now?: Date): Promise<string[]> {
    return urgentIds(await this.lists(companyId, now));
  }

  private async compute(companyId: string, now: Date): Promise<ShipmentsNeedingAttention> {
    const uploaded = await companyHolidays(companyId, businessDay(now));
    const day = opsDay(now, uploaded ?? []);
    // One more than judged, so "capped" means some were left out.
    const rows = await shipmentRepository.needsAttentionCandidates(companyId, candidateRange(day), NEEDS_ATTENTION_JOB_LIMIT + 1);
    const jobs: DueJob[] = rows.slice(0, NEEDS_ATTENTION_JOB_LIMIT);
    const timeline = await this.timeline(closingToCheck(jobs, day), companyId);
    return {
      ...needsAttentionOf(jobs, timeline, day),
      capped: rows.length > NEEDS_ATTENTION_JOB_LIMIT,
      holidaysKnown: uploaded !== null,
      notKnown: timeline ? [] : [CLOSING_NOT_KNOWN],
    };
  }

  /** Whether the cargo is in, for the jobs whose Closing hangs on it; null when the events could not be read (D29: it is named). */
  private async timeline(ids: readonly string[], companyId: string): Promise<Map<string, TimelineFacts> | null> {
    if (ids.length === 0) return new Map();
    try {
      return await timelineOf(ids, companyId);
    } catch (err) {
      log.warn(err, "Needs Attention could not read the tracking events: a Closing still ahead is listed by its date, no Closing is said to be missed");
      return null;
    }
  }
}

export const needsAttentionService = new NeedsAttentionService();
