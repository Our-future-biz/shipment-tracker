import log from "encore.dev/log";
import { iso } from "../../../lib/db/serialize";
import type { OpsSignal } from "../lib/managersCockpit";
import {
  UNDER_CLEARANCE,
  conceptRemeasureOpen,
  customsFieldSignals,
  dangerousSignals,
  deliveryOrderSignals,
  documentReviewSignals,
  importInstructionSignals,
  masterJobHouseSignals,
  masterJobRowSignals,
  masterJobWindowEnd,
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
import { judgedCharge, matchesNow, shownCargo, type CargoRows } from "../lib/remeasureMatch";
import { REMEASURE_INFORMED, chargeKindOf, informedSource, remeasureVerdict, type ChargeKind, type RemeasureFrom } from "../lib/remeasureNotice";
import { cargoDimensionRepository } from "../repositories/cargoDimension.repository";
import { cargoItemRepository } from "../repositories/cargoItem.repository";
import { containerRepository } from "../repositories/container.repository";
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
// statements in all; three more, after the history, for the Cargo Details rows of the jobs a
// remeasurement from Warehouse Concept still asks to check) and judged by the pure rules of
// lib/managersCockpitExtra. It only reads.
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
  cargoDetails: "Cargo Details of jobs remeasured in Warehouse Concept",
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

/**
 * Which warehouse an Inform Operations line came from, as services/alert.service reads it: the
 * `source` its new value names, the Warehouse's for a line written before the source was kept.
 */
export function remeasureSource(newValue: string | null): RemeasureFrom {
  // The one reader of the line's source (lib/remeasureNotice), so the cockpit, the Alerts tab and the verdict agree.
  return informedSource(newValue);
}

/**
 * What a job is charged by now, for an Inform Operations whose entry kept no charge: only when the
 * row read carries its Load Type - a guess without it could take a Full Load for W/M - else
 * undefined, the cautious default.
 */
export function jobChargeOf(job: Pick<ExtraJob, "freightMode" | "loadType">): ChargeKind | undefined {
  return job.loadType === undefined ? undefined : chargeKindOf(job.freightMode, job.loadType);
}

const NO_CARGO_ROWS: CargoRows = { containers: [], items: [], dimensions: [] };

/**
 * The Container and Cargo Details rows of `ids`, by shipment: three statements, together. With the
 * job's stored fields they are the shipment as it shows (lib/remeasureMatch shownCargo).
 */
async function cargoRowsOf(ids: readonly string[], companyId: string, run: Limit): Promise<Map<string, CargoRows>> {
  const [containers, items, dimensions] = await Promise.all([
    run(() => containerRepository.listByShipmentIds([...ids], companyId)),
    run(() => cargoItemRepository.listByShipmentIds([...ids], companyId)),
    run(() => cargoDimensionRepository.listByShipmentIds([...ids], companyId)),
  ]);
  const [byContainer, byItem, byDimension] = [byShipment(containers), byShipment(items), byShipment(dimensions)];
  return new Map(ids.map((id) => [id, { containers: byContainer.get(id) ?? [], items: byItem.get(id) ?? [], dimensions: byDimension.get(id) ?? [] }]));
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
      const rows = await run(() => masterJobRepository.cockpitFacts(companyId, masterJobIds, today, masterJobWindowEnd(today, holidays)));
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

  // Each job's remeasurement as its history tells it - and, for one from Warehouse Concept that
  // still asks for a check by hand (conceptRemeasureOpen), whether the shipment as it shows now
  // matches it (lib/remeasureMatch, the Alerts tab's judgement, Y4). Only those jobs' Cargo
  // Details rows are read, after the history said which they are: a handful, seldom any.
  const remeasureOf = new Map<string, { fact: RemeasureFact; newValue: string | null }>();
  for (const job of historyOf ? jobs : []) {
    const rows = historyOf!.get(job.id) ?? [];
    const latest = (field: string) => rows.find((r) => r.field === field) ?? null;
    const informed = latest(REMEASURE_INFORMED);
    const accepted = latest(REMEASURE_ACCEPTED);
    const checked = latest(REMEASURE_COSTS_CHECKED);
    const fact: RemeasureFact = {
      // How the figures stood when the warehouse informed: old = the shipment's, new = the remeasured - and
      // which warehouse it was (services/alert.service reads the line the same way).
      informed: informed
        ? {
            at: informed.changedAt,
            // Warehouse Concept's tolerance counts as a match, as in its chat message (lib/remeasureNotice remeasureVerdict);
            // judged by the charge the entry kept, else the job's own - as Alerts and the chat judged it. Without
            // one, a Full Load job with no volume measured at 20 m³ read as an urgent W/M change.
            verdict: remeasureVerdict(readFigures(informed.oldValue), readFigures(informed.newValue), remeasureSource(informed.newValue), judgedCharge(informed.newValue, jobChargeOf(job))),
            source: remeasureSource(informed.newValue),
            matchesCargoDetails: false,
            remeasured: readFigures(informed.newValue),
          }
        : null,
      acceptedAt: accepted?.changedAt ?? null,
      // What the acceptance took: an Inform Again of those figures after it is settled by it (review of system-23).
      acceptedFigures: accepted ? readFigures(accepted.newValue) : null,
      // A check names the acceptance it was made for (services/shipment.service markRemeasureCostsChecked): only a
      // check of the latest acceptance counts, as on Cargo Details and Costs Breakdown.
      costsCheckedAt: checked && accepted && checked.newValue === iso(accepted.changedAt) ? checked.changedAt : null,
    };
    remeasureOf.set(job.id, { fact, newValue: informed?.newValue ?? null });
  }
  const toCheck = jobs.filter((job) => {
    const r = remeasureOf.get(job.id);
    return !!r && conceptRemeasureOpen(r.fact, now);
  });
  // Not read: the warning stands (not known to match) and the page names the part.
  const toCheckIds = toCheck.map((j) => j.id);
  const cargo = toCheckIds.length ? await part(EXTRA_PARTS.cargoDetails, () => cargoRowsOf(toCheckIds, companyId, run)) : new Map<string, CargoRows>();
  for (const job of toCheck) {
    const r = remeasureOf.get(job.id)!;
    if (cargo && r.fact.informed) r.fact.informed.matchesCargoDetails = matchesNow(shownCargo(job, cargo.get(job.id) ?? NO_CARGO_ROWS), r.newValue, jobChargeOf(job));
  }

  const byJob = new Map<string, OpsSignal[]>();
  for (const job of jobs) {
    const signals: OpsSignal[] = [...originalBlSignals(job, today, holidays), ...deliveryOrderSignals(job, today, holidays)];

    // The customs status the shipment shows follows its documents: without them it is not known,
    // and neither is anything that is read off it.
    const files: DocumentFact[] | null = documentsOf ? (documentsOf.get(job.id) ?? []) : null;
    const shown = files ? shownCustomsStatus(job.customsStatus, files) : null;
    if (files && shown !== null) {
      signals.push(...paperworkSignals(job, shown, today, holidays), ...documentReviewSignals(job, shown, files, now, holidays), ...dangerousSignals(job, files, today, holidays));
    }
    signals.push(...customsFieldSignals(job, shown, today, holidays));

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
      signals.push(...remeasurementSignals(job, remeasureOf.get(job.id)!.fact, today, now, holidays));

      signals.push(...statusStuckSignals(job, latest("status")?.changedAt ?? null, now, holidays));
      // Only the change that set it tells since when: a later step taken back leaves an older "since" unknown.
      const customs = latest("customsStatus");
      if (shown !== null) signals.push(...underClearanceSignals(shown, customs && customs.newValue === UNDER_CLEARANCE ? customs.changedAt : null, now, holidays));
    }

    if (masterOf && job.masterJobId) signals.push(...masterJobHouseSignals(job, masterOf.get(job.masterJobId) ?? null, today, holidays));

    if (signals.length) byJob.set(job.id, signals);
  }

  const masterJobRows: MasterJobRow[] = (masters?.rows ?? []).flatMap((m): MasterJobRow[] => {
    // A master job one of the jobs read is a house of has a shipment, whatever the count would say.
    const signals = masterJobIds.includes(m.id) ? [] : masterJobRowSignals(m, masters!.houses.get(m.id) ?? 0, today, holidays);
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
    [EXTRA_PARTS.cargoDetails, cargo],
  ];
  return { byJob, masterJobRows, notKnown: read.filter(([, rows]) => rows === null).map(([name]) => name) };
}
