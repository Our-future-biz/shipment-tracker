import log from "encore.dev/log";
import { addDays } from "../../../lib/businessDate";
import { iso } from "../../../lib/db/serialize";
import type { OpsSignal } from "../lib/managersCockpit";
import { MASTER_JOB_NO_HOUSE_DAYS } from "../lib/cockpitThresholds";
import {
  UNDER_CLEARANCE,
  customsFieldSignals,
  dangerousSignals,
  deliveryOrderSignals,
  documentReviewSignals,
  importInstructionSignals,
  masterJobHouseSignals,
  masterJobRowSignals,
  originalBlSignals,
  paperworkSignals,
  remeasurementSignals,
  requestSignals,
  shownCustomsStatus,
  statusStuckSignals,
  underClearanceSignals,
  watchesStatus,
  type DocumentFact,
  type ExtraJob,
  type ExtraSignals,
  type ImportInstructionFact,
  type MasterJobRow,
  type RemeasureFact,
  type RequestFact,
} from "../lib/managersCockpitExtra";
import { unlimited, type Limit } from "../lib/readLimiter";
import { REMEASURE_ACCEPTED, REMEASURE_COSTS_CHECKED, readFigures } from "../lib/remeasureAccept";
import { REMEASURE_INFORMED, remeasureVerdict } from "../lib/remeasureNotice";
import { customsOfficeRequestRepository } from "../repositories/customsOfficeRequest.repository";
import { documentChangeRequestRepository } from "../repositories/documentChangeRequest.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentImportInstructionRepository } from "../repositories/shipmentImportInstruction.repository";

export type { ExtraJob, ExtraSignals } from "../lib/managersCockpitExtra";

// Shipments → Managers, step 2: what the cockpit's jobs are told by the tables beside the
// shipment's own - documents, requests, Import Instructions, the history (a remeasurement, how
// long a status has stood) and Master Jobs. Each read for all the jobs together (seven
// statements in all) and judged by the pure rules of lib/managersCockpitExtra. It only reads.
//
// Each part is read on its own: one that fails gives no signal and is named in `notKnown`, in
// the words the page shows after "Not known right now:" - the others still answer (D29: not known
// is not zero, and a slow table must not blank the whole cockpit). The history is one read for
// its two parts - the remeasurements and how long a status has stood - so they fail together.

/** The parts, as the page names one that could not be read. */
export const EXTRA_PARTS = {
  documents: "documents",
  requests: "requests waiting for a manager",
  importInstructions: "Import Instructions",
  remeasurements: "remeasurements",
  statusAges: "how long a status has stood",
  masterJobs: "Master Jobs",
} as const;

export interface ExtraContext {
  companyId: string;
  /** The one moment the whole cockpit is judged on… */
  now: Date;
  /** …and its Prague business day, YYYY-MM-DD. */
  today: string;
  /** The company's non-working days beyond the statutory ones (lib/workingDays' extraHolidays). */
  holidays: readonly string[];
  /** The limiter of the answer these reads are part of (lib/readLimiter): each statement goes through it. Left out, they all run at once. */
  run?: Limit;
}

/** The read of one part: null when it failed, which the caller names in `notKnown`. */
async function part<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    log.warn(err, "a part of Shipments → Managers could not be read", { part: name });
    return null;
  }
}

/** Each shipment's rows, in the order they were read. */
function byShipment<R extends { shipmentId: string }>(rows: readonly R[]): Map<string, R[]> {
  const map = new Map<string, R[]>();
  for (const row of rows) {
    const list = map.get(row.shipmentId);
    if (list) list.push(row);
    else map.set(row.shipmentId, [row]);
  }
  return map;
}

export async function extraSignals(jobs: readonly ExtraJob[], ctx: ExtraContext): Promise<ExtraSignals> {
  const { companyId, now, today, holidays, run = unlimited } = ctx;
  const ids = jobs.map((j) => j.id);
  const masterJobIds = [...new Set(jobs.flatMap((j) => (j.masterJobId ? [j.masterJobId] : [])))];

  // The history is the largest table here, so it is asked only what a rule will read: the
  // remeasurement of every job, the status only where it is watched for standing still, and the
  // customs status only where it is stored as Under Customs Clearance - all known from the rows.
  const historyAsks = [
    { fields: [REMEASURE_INFORMED, REMEASURE_ACCEPTED, REMEASURE_COSTS_CHECKED], shipmentIds: ids },
    { fields: ["status"], shipmentIds: jobs.filter(watchesStatus).map((j) => j.id) },
    { fields: ["customsStatus"], shipmentIds: jobs.filter((j) => j.customsStatus === UNDER_CLEARANCE).map((j) => j.id) },
  ];

  const [documents, requests, forms, history, masters] = await Promise.all([
    part(EXTRA_PARTS.documents, () => run(() => shipmentAttachmentRepository.reviewFactsByShipmentIds(ids, companyId))),
    part(EXTRA_PARTS.requests, async (): Promise<(RequestFact & { shipmentId: string })[]> => {
      const [document, office] = await Promise.all([
        run(() => documentChangeRequestRepository.waitingByShipmentIds(ids, companyId)),
        run(() => customsOfficeRequestRepository.waitingByShipmentIds(ids, companyId)),
      ]);
      return [...document.map((r) => ({ ...r, kind: "document" as const })), ...office.map((r) => ({ ...r, kind: "customs_office" as const }))];
    }),
    part(EXTRA_PARTS.importInstructions, () => run(() => shipmentImportInstructionRepository.liveByShipmentIds(ids, companyId))),
    part(`${EXTRA_PARTS.remeasurements}, ${EXTRA_PARTS.statusAges}`, () => run(() => shipmentAuditRepository.latestByShipmentIds(companyId, historyAsks))),
    part(EXTRA_PARTS.masterJobs, async () => {
      const rows = await run(() => masterJobRepository.cockpitFacts(companyId, masterJobIds, today, addDays(today, MASTER_JOB_NO_HOUSE_DAYS)));
      // Only a master job that is no house's of the jobs read can be without a shipment: those are counted.
      const loose = rows.filter((m) => !masterJobIds.includes(m.id)).map((m) => m.id);
      return { rows, houses: await run(() => masterJobRepository.shipmentCounts(loose, companyId)) };
    }),
  ]);

  const documentsOf = documents && byShipment(documents);
  const requestsOf = requests && byShipment(requests);
  const formOf = forms && new Map(forms.map((f) => [f.shipmentId, f]));
  const historyOf = history && byShipment(history);
  const masterOf = masters && new Map(masters.rows.map((m) => [m.id, m]));

  const byJob = new Map<string, OpsSignal[]>();
  for (const job of jobs) {
    const signals: OpsSignal[] = [...originalBlSignals(job, today), ...deliveryOrderSignals(job, today, holidays)];

    // The customs status the shipment shows follows its documents: without them it is not known,
    // and neither is anything that is read off it.
    const files: DocumentFact[] | null = documentsOf ? (documentsOf.get(job.id) ?? []) : null;
    const shown = files ? shownCustomsStatus(job.customsStatus, files) : null;
    if (files && shown !== null) {
      signals.push(...paperworkSignals(job, shown, today), ...documentReviewSignals(job, shown, files, now, holidays), ...dangerousSignals(job, files, today));
    }
    signals.push(...customsFieldSignals(job, shown, today));

    if (requestsOf) signals.push(...requestSignals(job, requestsOf.get(job.id) ?? [], now, holidays));

    if (formOf) {
      const form = formOf.get(job.id);
      // The read asks for live forms only; anything else would be no fact of this rule.
      const fact: ImportInstructionFact | null = form && (form.status === "open" || form.status === "submitted") ? { status: form.status, submittedAt: form.submittedAt, expiresAt: form.expiresAt } : null;
      signals.push(...importInstructionSignals(job, fact, today, now, holidays));
    }

    if (historyOf) {
      const rows = historyOf.get(job.id) ?? [];
      const latest = (field: string) => rows.find((r) => r.field === field) ?? null;
      const informed = latest(REMEASURE_INFORMED);
      const accepted = latest(REMEASURE_ACCEPTED);
      const checked = latest(REMEASURE_COSTS_CHECKED);
      const fact: RemeasureFact = {
        // How the figures stood when the warehouse informed: old = the shipment's, new = the remeasured (services/alert.service).
        informed: informed ? { at: informed.changedAt, verdict: remeasureVerdict(readFigures(informed.oldValue), readFigures(informed.newValue)) } : null,
        acceptedAt: accepted?.changedAt ?? null,
        // A check names the acceptance it was made for (services/shipment.service markRemeasureCostsChecked): only a
        // check of the latest acceptance counts, as on Cargo Details and Costs Breakdown.
        costsCheckedAt: checked && accepted && checked.newValue === iso(accepted.changedAt) ? checked.changedAt : null,
      };
      signals.push(...remeasurementSignals(job, fact, today, now, holidays));

      signals.push(...statusStuckSignals(job, latest("status")?.changedAt ?? null, now, holidays));
      // Only the change that set it tells since when: a later step taken back leaves an older "since" unknown.
      const customs = latest("customsStatus");
      if (shown !== null) signals.push(...underClearanceSignals(shown, customs && customs.newValue === UNDER_CLEARANCE ? customs.changedAt : null, now, holidays));
    }

    if (masterOf && job.masterJobId) signals.push(...masterJobHouseSignals(job, masterOf.get(job.masterJobId) ?? null, today));

    if (signals.length) byJob.set(job.id, signals);
  }

  const masterJobRows: MasterJobRow[] = (masters?.rows ?? []).flatMap((m): MasterJobRow[] => {
    // A master job one of the jobs read is a house of has a shipment, whatever the count would say.
    const signals = masterJobIds.includes(m.id) ? [] : masterJobRowSignals(m, masters!.houses.get(m.id) ?? 0, today);
    if (!signals.length) return [];
    const direction = m.tradeDirection.trim().toLowerCase();
    const customer = direction === "export" ? m.shipper || m.consignee : m.consignee || m.shipper;
    return [{ id: m.id, number: m.mczNumber, customer: customer.trim(), signals, freightMode: m.freightMode, tradeDirection: m.tradeDirection, handledBy: m.personInCharge.trim(), holidayCover: m.holidayCover.trim() }];
  });
  masterJobRows.sort((a, b) => a.number.localeCompare(b.number));

  // In the parts' own order, whichever read failed first.
  const read: [string, unknown][] = [
    [EXTRA_PARTS.documents, documents],
    [EXTRA_PARTS.requests, requests],
    [EXTRA_PARTS.importInstructions, forms],
    [EXTRA_PARTS.remeasurements, history],
    [EXTRA_PARTS.statusAges, history],
    [EXTRA_PARTS.masterJobs, masters],
  ];
  return { byJob, masterJobRows, notKnown: read.filter(([, rows]) => rows === null).map(([name]) => name) };
}
