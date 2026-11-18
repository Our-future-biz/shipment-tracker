import log from "encore.dev/log";
import { trucking, warehouseConcept } from "~encore/clients";
import type { TruckingOperationsFacts } from "../../trucking/interfaces/interfaces";
import type { WarehouseOperationsFacts } from "../../warehouseConcept/interfaces/interfaces";
import { HANDOVER_CALL_TIMEOUT_MS, HANDOVER_FACTS_KEPT_MINUTES } from "../lib/cockpitThresholds";
import { HANDOVER_NOT_KNOWN, handoverFactsOf, type HandoverFacts, type ModuleAnswer } from "../lib/managersCockpitHandover";

export type { HandoverFacts } from "../lib/managersCockpitHandover";

// Shipments → Managers, step 5 (D29, D30): the warehouse and Trucking asked about the cockpit's
// jobs - each ONE call per answer, for every active job the cockpit read (not only those the
// page's filters keep), each failing on its own: a module that does not answer gives no tag and no
// figure and is named in `notKnown`. The rules that turn their answers into tags are
// lib/managersCockpitHandover. It only reads; so do the two endpoints (warehouseConcept
// _internalWarehouseOperationsFacts, trucking _internalTruckingOperationsFacts).
//
// The calls hold no connection of Shipments' pool - the modules read their own databases - so they
// do not go through the answer's limiter (lib/readLimiter): the cockpit starts them first and its
// own statements run meanwhile. Nor may a slow module hold the page: each answer waits for each
// module HANDOVER_CALL_TIMEOUT_MS at most, then counts it as not read ("… (no answer within 6 s)");
// the call goes on, and an answer that comes whole after all is kept for the next poll.
//
// The warehouse's answer is some twenty-five statements on its side and the page asks every
// minute, per open page: each module's answer is kept in memory per company for
// HANDOVER_FACTS_KEPT_MINUTES and handed to whoever asks meanwhile - whatever their filters, which
// are applied afterwards - as long as it was asked about every job they ask about (a job opened
// since is asked about anew). Two asks at the same moment share one call. An answer that failed,
// or names a part it could not read, is not kept: the next ask tries again.

/** One module's answer as kept: when it was asked (the `now` of the answer that asked), about which jobs, and the call. */
interface Kept<T> {
  at: number;
  ids: ReadonlySet<string>;
  answer: Promise<T | null>;
}

const KEPT_MS = HANDOVER_FACTS_KEPT_MINUTES * 60_000;
const warehouseKept = new Map<string, Kept<WarehouseOperationsFacts>>();
const truckingKept = new Map<string, Kept<TruckingOperationsFacts>>();

/** Forgets every answer kept: the next ask calls. For the tests, which ask about one company many ways. */
export function forgetHandoverFacts(): void {
  warehouseKept.clear();
  truckingKept.clear();
}

/**
 * A module's answer about `ids`: the one kept for the company when it is younger than
 * HANDOVER_FACTS_KEPT_MINUTES and was asked about each of `ids`, else a new call. Null when the
 * call failed (logged with `module`).
 */
function answerOf<T extends { notKnown: string[] }>(kept: Map<string, Kept<T>>, module: string, companyId: string, ids: readonly string[], now: Date, call: () => Promise<T>): Promise<T | null> {
  const before = kept.get(companyId);
  const age = before ? now.getTime() - before.at : -1;
  if (before && age >= 0 && age < KEPT_MS && ids.every((id) => before.ids.has(id))) return before.answer;
  // Started at once (the call is sent before the cockpit's own statements), and a call that throws
  // before it even sends counts as failed, like one that fails on the way.
  let sent: ReturnType<typeof call>;
  try {
    sent = call();
  } catch (err) {
    sent = Promise.reject(err);
  }
  const answer = sent.catch((err: unknown) => {
    log.warn(err, "a part of Shipments → Managers could not be read", { part: module });
    return null;
  });
  kept.set(companyId, { at: now.getTime(), ids: new Set(ids), answer });
  // Failed, or not whole: not kept - unless a newer call has taken its place meanwhile.
  void answer.then((read) => {
    if ((!read || read.notKnown.length > 0) && kept.get(companyId)?.answer === answer) kept.delete(companyId);
  });
  return answer;
}

/** The answer, or "late" when it has not come within HANDOVER_CALL_TIMEOUT_MS: this asker stops waiting, the call goes on. */
function inTime<T>(answer: Promise<T | null>, module: string): Promise<ModuleAnswer<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((done) => {
    timer = setTimeout(() => {
      log.warn("a part of Shipments → Managers gave no answer in time", { part: module, timeoutMs: HANDOVER_CALL_TIMEOUT_MS });
      done("late");
    }, HANDOVER_CALL_TIMEOUT_MS);
  });
  return Promise.race([answer, late]).finally(() => clearTimeout(timer));
}

export interface HandoverContext {
  companyId: string;
  /** The one moment the whole cockpit is judged on: what a kept answer's age is counted to. */
  now: Date;
}

/**
 * What the warehouse and Trucking say of `jobIds` - the active jobs the cockpit read, all of them
 * (the endpoints take up to 2000, COCKPIT_JOB_LIMIT). Never fails: a module that does not answer,
 * or not in time, is null in the facts and named in `notKnown`.
 */
export async function handoverFacts(jobIds: readonly string[], ctx: HandoverContext): Promise<HandoverFacts> {
  const { companyId, now } = ctx;
  // No job, nothing to ask: both are read, and say nothing.
  if (jobIds.length === 0) return handoverFactsOf({ shipments: [], notKnown: [] }, { shipments: [], notKnown: [], issuesRead: true, updatesRead: true });
  const shipmentIds = [...jobIds];
  const [warehouse, road] = await Promise.all([
    inTime(answerOf(warehouseKept, HANDOVER_NOT_KNOWN.warehouse, companyId, jobIds, now, () => warehouseConcept._internalWarehouseOperationsFacts({ shipmentIds })), HANDOVER_NOT_KNOWN.warehouse),
    inTime(answerOf(truckingKept, HANDOVER_NOT_KNOWN.trucking, companyId, jobIds, now, () => trucking._internalTruckingOperationsFacts({ shipmentIds })), HANDOVER_NOT_KNOWN.trucking),
  ]);
  return handoverFactsOf(warehouse, road);
}
