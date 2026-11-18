import type { TruckingOperationsFacts, TruckingShipmentFacts } from "../../trucking/interfaces/interfaces";
import type { WarehouseOperationsFacts, WarehouseShipmentFacts } from "../../warehouseConcept/interfaces/interfaces";
import type { OpsCockpitHandover } from "../interfaces/interfaces";
import type { OpsSignal } from "./managersCockpit";

// The operations managers' cockpit (Shipments → Managers, Council Outlay 11, step 5; D29, D30):
// what the warehouse and Trucking themselves say of the cockpit's jobs. Each is asked by shipment
// (services/managersCockpitHandover.service) and answers with its OWN judgement - the Warehouse
// cockpit's signals of each record, Trucking's issues of each consignment - so a job reads the
// same on all three pages. Nothing here judges again: a module's words become a tag as they are,
// with the record's or consignment's reference in front. Pure; tested in
// tests/managersCockpitHandover.test.ts.
//
// No two tags of one meaning. Step 2 read the road and the warehouse off the job's own timeline
// and columns (lib/managersCockpit roadSignals, warehouseSignals); where the module now says it
// itself, its word stands and the other goes:
//   road       step 2's road tags go on a job Trucking answered about - one with a consignment in
//              play there - when Trucking read its consignments, trips and exceptions
//              (`issuesRead`): its issues, or none, are then the word on that truck. A job Trucking
//              has nothing of (a Domestic job nobody booked in Trucking yet, a road job Trucking
//              does not run) keeps them, and so does every job when Trucking could not say.
//   warehouse  step 2's "ETA warehouse … passed, not received" and "In our warehouse since …, no
//              planned delivery" go only on a job one of whose records has a warehouse signal of
//              the same meaning (WAREHOUSE_SAME_MEANING); else they stay. The other way round, a
//              warehouse signal goes where the job already says the same on its own
//              (WAREHOUSE_SAID_BY_THE_JOB): a box's detention beside the job's free time clock,
//              stuffing against a closing beside the job's Closing.
//
// A module that could not be read gives no tag and no figure, and is named (D29: not known is not zero).

// ─── What was read ──────────────────────────────────────────────

/** What one module answered for the jobs it was asked about, by shipment id. */
export interface ModuleFacts<F> {
  byJob: ReadonlyMap<string, F>;
  /** True when the module named nothing it could not read. */
  whole: boolean;
}

/** Trucking's answer, with what it says it read. */
export interface TruckingFacts extends ModuleFacts<TruckingShipmentFacts> {
  /** Its consignments, trips and exceptions were all read: its issues are the whole of them. */
  issuesRead: boolean;
  /** Its updates to the jobs were read: a job it left out owes none. */
  updatesRead: boolean;
}

/** The two modules' facts for one cockpit answer: null for a module that could not be read. */
export interface HandoverFacts {
  warehouse: ModuleFacts<WarehouseShipmentFacts> | null;
  trucking: TruckingFacts | null;
  /** What could not be read, in the words the page shows after "Not known right now:". */
  notKnown: string[];
}

/** What the page shows for a module that could not be asked, or did not answer. */
export const HANDOVER_NOT_KNOWN = {
  warehouse: "the warehouse's records",
  trucking: "Trucking's consignments",
} as const;
/** Said after a module's name when it gave no answer in time (services/managersCockpitHandover.service HANDOVER_CALL_TIMEOUT_MS). */
export const NO_ANSWER_IN_TIME = "(no answer within 6 s)";

/** A module's answer as the service hands it on: the answer, null when the call failed, "late" when it gave none in time. */
export type ModuleAnswer<T> = T | null | "late";

/** Neither module was asked: no tag, no figure, and step 2's own road and warehouse tags as they are. What the cockpit's rules read when no facts are handed in. */
export const NO_HANDOVER_FACTS: HandoverFacts = { warehouse: null, trucking: null, notKnown: [] };

/** "Warehouse: …" - a part a module named as not known, said with the module's name. */
const prefixed = (prefix: string, notKnown: readonly string[]) => notKnown.map((what) => `${prefix}${what}`);
/** The module's name when it did not answer: as it is when it failed, with "(no answer within 6 s)" when it was late. */
const notAnswered = (name: string, answer: "late" | null) => (answer === "late" ? `${name} ${NO_ANSWER_IN_TIME}` : name);

/**
 * The two answers as the cockpit's rules read them (see ModuleAnswer). A module's own `notKnown`
 * is passed on with its name in front, each once; one that did not answer is named as a whole.
 * Trucking's `issuesRead` / `updatesRead` are taken as they come: one an older Trucking does not
 * send counts as not read.
 */
export function handoverFactsOf(warehouse: ModuleAnswer<WarehouseOperationsFacts>, trucking: ModuleAnswer<TruckingOperationsFacts>): HandoverFacts {
  const of = <F extends { shipmentId: string }>(answer: { shipments: F[]; notKnown: string[] }): ModuleFacts<F> => ({
    byJob: new Map(answer.shipments.map((s) => [s.shipmentId, s])),
    whole: answer.notKnown.length === 0,
  });
  const w = warehouse === "late" ? null : warehouse;
  const t = trucking === "late" ? null : trucking;
  return {
    warehouse: w && of(w),
    trucking: t && { ...of(t), issuesRead: t.issuesRead === true, updatesRead: t.updatesRead === true },
    notKnown: [
      ...new Set([
        ...(w ? prefixed("Warehouse: ", w.notKnown) : [notAnswered(HANDOVER_NOT_KNOWN.warehouse, warehouse as "late" | null)]),
        ...(t ? prefixed("Trucking: ", t.notKnown) : [notAnswered(HANDOVER_NOT_KNOWN.trucking, trucking as "late" | null)]),
      ]),
    ],
  };
}

// ─── Ranks ──────────────────────────────────────────────────────
// On lib/managersCockpit OPS_RANK's own scale (lower = higher in its card). URGENT: after step 2's
// own delivery and road ones (58-59) and the requests waiting for a manager (60), before free time
// (80) - a record or consignment stuck now is the same kind of thing as a truck that did not come.
// ATTENTION: after step 2's delivery, warehouse and road warnings (242-248). A module's tags keep
// the order the module gave them (rankRow sorts stably): the warehouse lists its urgent first.
export const HANDOVER_RANK = {
  warehouseUrgent: 61,
  truckingUrgent: 62,
  warehouse: 251,
  trucking: 252,
} as const;

// ─── The tags ───────────────────────────────────────────────────

const tag = (urgent: boolean, rank: number, kind: "warehouse" | "road", text: string): OpsSignal => ({ rank, text, urgent, kind, area: "tracking" });

/** What the job says on its own that a warehouse signal may say too (WAREHOUSE_SAID_BY_THE_JOB). */
export interface JobSays {
  /** Needs Attention's free time clock of the job's boxes is on it ("Free time over", "Free time ends"). */
  freeTimeClock: boolean;
  /** A Closing cut-off tag is on it (due, ahead or missed). */
  closing: boolean;
}
const SAYS_NOTHING: JobSays = { freeTimeClock: false, closing: false };

/**
 * Warehouse signals the job's own tags already say (warehouseConcept/services/managersCockpit.ts
 * containerSignals; tests/managersCockpitHandover.test.ts checks that file still says them):
 *   detention  "Detention expires in 2 days (20.11.2026) — book the empty return" / "… expires
 *              today …" / "Detention expired 1 day ago …": the box's free time, which the job's
 *              free time clock counts already - not a box with no free time typed, which has no
 *              clock and leaves the warehouse's word the only one.
 *   stuffing   "Stuffing: 2 houses not stuffed · closing in 1 day (19.11.2026)": against a closing
 *              - not one against the ETD, which no cut-off tag says.
 */
export const WAREHOUSE_SAID_BY_THE_JOB = {
  detention: /^Detention expire[sd] /,
  stuffingClosing: /^Stuffing: .* · (\d+ days? past the closing|closing today|closing in \d+ days?) \(/,
} as const;

/** Whether a warehouse signal is said by the job already (WAREHOUSE_SAID_BY_THE_JOB): then it gives no tag. */
export const saidByTheJob = (text: string, says: JobSays): boolean =>
  (says.freeTimeClock && WAREHOUSE_SAID_BY_THE_JOB.detention.test(text)) || (says.closing && WAREHOUSE_SAID_BY_THE_JOB.stuffingClosing.test(text));

/** Each signal the Warehouse cockpit gives a record of the job - "Warehouse · WCZ00012: Pick-up PIN: locked 23.10. 09:12" - but those the job says already. */
export function warehouseTags(facts: WarehouseShipmentFacts | undefined, says: JobSays = SAYS_NOTHING): OpsSignal[] {
  return (facts?.records ?? []).flatMap((r) =>
    r.signals
      .filter((s) => !saidByTheJob(s.text, says))
      .map((s) => tag(s.urgent, s.urgent ? HANDOVER_RANK.warehouseUrgent : HANDOVER_RANK.warehouse, "warehouse", `Warehouse · ${r.ref}: ${s.text}`)),
  );
}

/** Each issue Trucking sees with a consignment of the job: "Trucking · TCZ00031: Pick-up date passed and no pick-up stamped". */
export function truckingTags(facts: TruckingShipmentFacts | undefined): OpsSignal[] {
  return (facts?.consignments ?? []).flatMap((c) =>
    c.issues.map((i) => tag(i.urgent, i.urgent ? HANDOVER_RANK.truckingUrgent : HANDOVER_RANK.trucking, "road", `Trucking · ${c.ref}: ${i.text}`)),
  );
}

/** The tags the two modules give one job: none of a module that was not read. `says`: what the job's own tags say already. */
export const handoverSignals = (jobId: string, facts: HandoverFacts, says: JobSays = SAYS_NOTHING): OpsSignal[] => [
  ...(facts.warehouse ? warehouseTags(facts.warehouse.byJob.get(jobId), says) : []),
  ...(facts.trucking ? truckingTags(facts.trucking.byJob.get(jobId)) : []),
];

// ─── No two tags of one meaning ───────────────────────────────────────

/**
 * Whether step 2's road tags of a job (lib/managersCockpit roadSignals: "Pick-up today, haulier
 * not confirmed", "Pick-up 17.11. passed, not picked up", "Delivered 12.11., no POD · 4 working
 * days") give way to Trucking's: when Trucking read its consignments, trips and exceptions
 * (`issuesRead`) and answered about the job - it has a consignment in play there. A job Trucking
 * has nothing of is one it cannot judge: its own timeline still speaks for it.
 */
export const truckingSpeaksForRoad = (jobId: string, facts: HandoverFacts): boolean =>
  !!facts.trucking?.issuesRead && (facts.trucking.byJob.get(jobId)?.consignments.length ?? 0) > 0;

/**
 * What step 2's two warehouse tags mean, and the Warehouse cockpit's words of the same meaning
 * (warehouseConcept/services/managersCockpit.ts recordSignals; tests/managersCockpitHandover.test.ts
 * checks that file still says them):
 *   not received  step 2 "ETA warehouse 16.11. passed, not received" (the job's ETA warehouse
 *                 passed, nothing received) - the warehouse's notArrivedReason "Not arrived: dock
 *                 slot … passed" / "Not arrived: trip … due …" / "Not arrived: expected …", and
 *                 "Arrived 17.11. 08:10, not received (26 h)": the cargo came and nobody received it.
 *   no onward     step 2 "In our warehouse since 12.11., no planned delivery" (received, no planned
 *                 delivery, not released) - the warehouse's "Ready for release, no pick-up booked · …".
 */
export const WAREHOUSE_SAME_MEANING = {
  notReceived: { step2: /^ETA warehouse \S+ passed, not received$/, warehouse: [/^Not arrived: /, /^Arrived .+, not received \(/] },
  noOnward: { step2: /^In our warehouse since \S+, no planned delivery$/, warehouse: [/^Ready for release, no pick-up booked/] },
} as const;

/**
 * Whether one of step 2's warehouse tags of a job stays: unless a record of the job has a
 * warehouse signal of the same meaning (WAREHOUSE_SAME_MEANING). Any other tag stays as it is.
 */
export function stepTwoWarehouseTagStays(signal: Pick<OpsSignal, "text">, jobId: string, facts: HandoverFacts): boolean {
  const meaning = Object.values(WAREHOUSE_SAME_MEANING).find((m) => m.step2.test(signal.text));
  if (!meaning) return true;
  const said = (facts.warehouse?.byJob.get(jobId)?.records ?? []).flatMap((r) => r.signals.map((s) => s.text));
  return !said.some((text) => meaning.warehouse.some((words) => words.test(text)));
}

// ─── The hand-over line ─────────────────────────────────────────────

/**
 * The updates each module owes the page's jobs (`jobIds`: those left after the page's filters):
 * waiting too long, and failed. Null - never 0 - for a module that was not read, for Trucking when
 * it could not read its updates (`updatesRead`: then a job it left out is not known either), and
 * when a job's figure is null. A job a module left out of an answer that read its updates owes
 * nothing: Trucking leaves out the jobs with nothing in play, the warehouse only ids that are no ids.
 */
export function handoverLine(facts: HandoverFacts, jobIds: readonly string[]): OpsCockpitHandover {
  const sum = <F extends { updatesWaiting: number | null; updatesFailed: number | null }>(module: ModuleFacts<F> | null, key: "updatesWaiting" | "updatesFailed"): number | null => {
    if (!module) return null;
    let total = 0;
    for (const id of jobIds) {
      const entry = module.byJob.get(id);
      if (!entry) continue;
      const n = entry[key];
      if (n === null) return null;
      total += n;
    }
    return total;
  };
  const trucking = facts.trucking?.updatesRead ? facts.trucking : null;
  return {
    warehouseUpdatesWaiting: sum(facts.warehouse, "updatesWaiting"),
    warehouseUpdatesFailed: sum(facts.warehouse, "updatesFailed"),
    truckingUpdatesWaiting: sum(trucking, "updatesWaiting"),
    truckingUpdatesFailed: sum(trucking, "updatesFailed"),
  };
}
