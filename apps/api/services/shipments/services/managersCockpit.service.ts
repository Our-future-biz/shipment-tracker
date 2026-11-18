import log from "encore.dev/log";
import { businessDay } from "../../../lib/businessDate";
import type { OpsCockpitDirection, OpsCockpitMode, ShipmentsManagersCockpit } from "../interfaces/interfaces";
import { COCKPIT_JOB_LIMIT } from "../lib/cockpitThresholds";
import {
  COCKPIT_EVENT_KINDS,
  boxesWanted,
  buildOpsCockpit,
  timelineFactsOf,
  type CockpitBox,
  type OpsCockpitJob,
  type OpsMasterJobRow,
  type OpsSignal,
  type TimelineEvent,
  type TimelineFacts,
} from "../lib/managersCockpit";
import { CLOCK_EVENT_KINDS } from "../lib/detentionClock";
import { userEmails } from "../lib/userEmails";
import { containerRepository } from "../repositories/container.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import { companyHolidays } from "./companyHolidays";
import { extraSignals } from "./managersCockpitExtra.service";
import { attentionFactsOf } from "./trackingAttention.service";

export interface OpsCockpitFilters {
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** An e-mail, "nobody", or null for everyone. */
  handledBy: string | null;
}

/** What the page shows after "Not known right now:" for a part of this file's own that could not be read. */
export const NOT_KNOWN = {
  timeline: "tracking events (Closing, holds, rolled, pick-up, POD)",
  boxes: "containers without free time",
  // Everything services/managersCockpitExtra.service reads, when it fails as a whole.
  extra: "documents, customs, requests, Import Instructions, remeasurements and Master Jobs",
} as const;

/** The jobs' tracking events both the boxes' free time clocks and the timeline rules go by: one read for the two. */
const EVENT_KINDS: readonly string[] = [...CLOCK_EVENT_KINDS, ...COCKPIT_EVENT_KINDS];
const isOfKinds = (kinds: readonly string[]) => (event: { kind: string }) => kinds.includes(event.kind);

/** A part that may fail without taking the answer with it: null when it did (D29: it then gives no signal and is named). */
async function part<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    log.warn(err, "a part of Shipments → Managers could not be read", { part: name });
    return null;
  }
}

/** Each shipment's rows. */
function byShipment<R extends { shipmentId: string }>(rows: readonly R[]): Map<string, R[]> {
  const map = new Map<string, R[]>();
  for (const row of rows) {
    const list = map.get(row.shipmentId);
    if (list) list.push(row);
    else map.set(row.shipmentId, [row]);
  }
  return map;
}

/** What the jobs' timelines say (lib/managersCockpit timelineFactsOf), by shipment id; a job with no such event has no entry. */
function timelineOf(events: readonly (TimelineEvent & { shipmentId: string })[]): Map<string, TimelineFacts> {
  return new Map([...byShipment(events.filter(isOfKinds(COCKPIT_EVENT_KINDS)))].map(([id, rows]) => [id, timelineFactsOf(rows)]));
}

/** The containers of the jobs whose free time the cockpit looks at (boxesWanted): few, so their boxes are read whole. */
async function boxesOf(jobs: readonly OpsCockpitJob[], companyId: string, today: string): Promise<Map<string, CockpitBox[]>> {
  const ids = jobs.filter((job) => boxesWanted(job, today)).map((job) => job.id);
  return byShipment<CockpitBox & { shipmentId: string }>(await containerRepository.listByShipmentIds(ids, companyId));
}

// Shipments → Managers: the company's active jobs, what Needs Attention knows about them, what
// their timelines and the tables beside them say, the company's users and its holidays, judged
// by the pure rules of lib/managersCockpit on one `now`. It only reads. The jobs and Needs
// Attention's facts are the answer itself: it fails without them. Every part added in step 2 may
// fail on its own - it then gives no signal and the answer names it (`notKnown`, `holidaysKnown`).
class ManagersCockpitService {
  async cockpit(companyId: string, filters: OpsCockpitFilters, now = new Date()): Promise<ShipmentsManagersCockpit> {
    const today = businessDay(now);
    const [rows, users, uploaded] = await Promise.all([
      // One more than counted, so "capped" means some were left out.
      shipmentRepository.managersCockpitRows(companyId, COCKPIT_JOB_LIMIT + 1),
      userEmails(),
      companyHolidays(companyId, today),
    ]);
    const jobs: OpsCockpitJob[] = rows.slice(0, COCKPIT_JOB_LIMIT);
    const ids = jobs.map((j) => j.id);
    const extraHolidays = uploaded ?? [];
    // The events are read once, for the timeline rules and for Needs Attention's free time clocks.
    // The timeline may fail on its own; the clocks are part of the answer itself: when the one read
    // failed they are asked for again, by themselves, and the answer fails only if that fails too.
    const events = part(NOT_KNOWN.timeline, () => shipmentTrackingEventRepository.ofKinds(ids, companyId, EVENT_KINDS));
    const clockEvents = events.then((rows) => (rows ? rows.filter(isOfKinds(CLOCK_EVENT_KINDS)) : shipmentTrackingEventRepository.ofKinds(ids, companyId, CLOCK_EVENT_KINDS)));
    const [facts, moved, timeline, boxes, extra] = await Promise.all([
      attentionFactsOf(jobs, companyId, today, clockEvents),
      shipmentRepository.dateMovedLately(companyId, ids),
      events.then((rows) => rows && timelineOf(rows)),
      part(NOT_KNOWN.boxes, () => boxesOf(jobs, companyId, today)),
      // It answers for its own parts; this catches what it could not: then none of it is known.
      part(NOT_KNOWN.extra, () => extraSignals(jobs, { companyId, now, today, holidays: extraHolidays })),
    ]);
    const extraByJob: ReadonlyMap<string, readonly OpsSignal[]> = extra?.byJob ?? new Map();
    const masterJobRows: readonly OpsMasterJobRow[] = extra?.masterJobRows ?? [];
    return buildOpsCockpit({
      jobs,
      facts,
      timeline,
      boxes,
      movedIds: new Set(moved),
      // userEmails gives an empty map when the users could not be read, and a company always has
      // the user asking: empty is "not known", never "nobody is a user".
      userEmails: users.size > 0 ? new Set([...users.values()].map((email) => email.trim().toLowerCase())) : null,
      holidays: extraHolidays,
      holidaysKnown: uploaded !== null,
      extraByJob,
      masterJobRows,
      notKnown: [...(timeline ? [] : [NOT_KNOWN.timeline]), ...(boxes ? [] : [NOT_KNOWN.boxes]), ...(extra ? extra.notKnown : [NOT_KNOWN.extra])],
      capped: rows.length > COCKPIT_JOB_LIMIT,
      ...filters,
      now,
    });
  }
}

export const managersCockpitService = new ManagersCockpitService();
