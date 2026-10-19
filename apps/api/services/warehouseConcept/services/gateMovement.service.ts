import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { hash, verify } from "@node-rs/argon2";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementRepository, hasStamp, hasStampSql, type GateMovementRow } from "../repositories/gateMovement.repository";
import { containerRepository, dockSlotRepository } from "../repositories/warehouseRecords.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { gateMovementTable, type GateChecklist, type GateEvent, type GateMovementRecord, type GateReleaseLine, type GateSubPosition, type GateSurvey, type GateSurveyLine, type GateTransportLeg, type NewGateMovementRecord } from "../schemas/gateMovement.schema";
import type { NewShipmentOutboxRecord, ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import { gateExceptionRepository } from "../repositories/gateException.repository";
import type { WarehouseExceptionRecord } from "../schemas/warehouseException.schema";
import { cargoLeg, DOMESTIC, isDomestic, releasePlate, visitOfHandling } from "./direction";
import type { GateDockSlot, GateExceptionItem, GateMovementInput, GateMovementItem, GatePickupInfo, GateReweighItem, GateSurveyInput } from "../interfaces/gate.interfaces";
import { EXCEPTION_GATE, exceptionHold, noOpenExceptionSql } from "./osd";
import { isIsoDate, movementStorage, pragueDate, storageNote, type StorageInfo } from "./storage";
import { remeasureTotals, type RemeasureTotals } from "./remeasure";
import { warehouseSectionTable } from "../schemas/warehouseSection.schema";
import { CUSTOMS_CLEARED, CUSTOMS_STATUSES, customsLine, setCustomsLineSql } from "./customs";
import { deliverDue, shipmentUpdateState } from "./shipmentOutbox.service";
import { FOLLOW_LIST_LIMIT, FOLLOW_ON_GET_MS, FOLLOW_ON_LIST_MS, followCustoms } from "./shipmentFollow.service";
import { userName } from "./users";
import { pickupPinKey } from "./pinKey";
import { inputMessage } from "./inputError";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { isUuid } from "../../../lib/uuid";
import { acceptRecordedAt, checkRequestId, latest, offlineDetail, pragueHhmm, type StampOutcome, type SurveyOutcome } from "./offline";
import { dockSlotsOf } from "./dockSlots";
import { deliverGateEvents, enqueueGateEvents } from "./gateEvents.service";
import { gateInIsArrival, stampDeparts } from "./gateEvents";
import { protectTripLegs, tripFiguresOf } from "./tripSource";
import { reweighRepository } from "../repositories/reweigh.repository";
import type { WarehouseReweighRecord } from "../schemas/warehouseReweigh.schema";
import { needsReweigh, REWEIGH_FIRST, reweighOkSql } from "./reweigh";
import { positionLifecycle } from "./lifecycle";
import { syncStockForMovement, syncStockForMovements } from "./warehouseStockSync";
import { houseBlocksRelease, houseContexts, houseReleaseOkSql, isExportContainer, lockHouse, positionContainer, releaseHousesForArchive, tallyRequired, type HouseCtx } from "./houses";
import {
  isLinkedOutbound,
  linkedOutboundCond,
  linkedToShipmentCond,
  newPickupPin,
  PICKUP_PIN_GATE,
  pickupLineOkSql,
  pickupPinLine,
  hashPickupPin,
  hasPickupPin,
  pickupPinMatches,
  readPickup,
  setPickupLineSql,
  type PickupData,
} from "./pickupPin";

export const MAX_PIN_TRIES = 3;

// Every check starts pending; the gate clicks each one to done, problem or n/a.
export const DEFAULT_CHECKLIST: GateChecklist = { ht: "a", photos: "a", measure: "a", vgm: "a", seal: "a", dg: "a" };

const isFcl = (operationType: string) => /^FCL|Container yard/.test(operationType);

// Domestic cargo (Trucking's LTL through our hub): see direction.ts. Never "needs attention" for a
// missing MRN.
export { DOMESTIC, isDomestic, visitOfHandling } from "./direction";

export { CUSTOMS_CLEARED, CUSTOMS_MODES, CUSTOMS_STATUSES } from "./customs";
export const MAX_SUB_POSITIONS = 10;
export const MAX_FREE_DAYS = 365;
// Labels in one print of one movement (one per piece at most).
export const MAX_LABEL_COPIES = 500;
const LEGS: GateTransportLeg["leg"][] = ["IN", "OUT", "CFS"];

const numOrNull = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.max(0, v) : null);

// Each container is surveyed once on receipt and once on release; the two passes are kept
// apart. Surveys stored with the old "Both" phase count as the receipt pass.
export const SURVEY_PHASES = ["Receipt — survey on gate in", "Release — survey on gate out"];
export const surveyPhaseKey = (phase: string): "receipt" | "release" => (/^Release/.test(phase) ? "release" : "receipt");

const blankLine = (): GateSurveyLine => ({ qty: null, outerPacking: "", visual: [], inner: [] });

// Surveys stored before survey lines existed kept one packing / condition set on the record.
type StoredSurvey = GateSurvey & { outerPacking?: string; visual?: string[]; inner?: string[] };
export const normalizeSurvey = (s: StoredSurvey): GateSurvey => {
  const lines = Array.isArray(s.lines)
    ? s.lines
    : [{ qty: null, outerPacking: s.outerPacking ?? "", visual: s.visual ?? [], inner: s.inner ?? [] }];
  return {
    container: s.container,
    phase: s.phase,
    damaged: s.damaged,
    lost: s.lost,
    lines: (lines.length ? lines : [blankLine()]).map((l) => ({
      qty: numOrNull(l.qty),
      outerPacking: l.outerPacking ?? "",
      visual: l.visual ?? [],
      inner: l.inner ?? [],
    })),
    driverNote: s.driverNote,
    warehouseNote: s.warehouseNote,
    surveyedAt: s.surveyedAt,
    surveyedBy: s.surveyedBy,
  };
};

// Drops stored before the width / length / height columns had free-text dimensions.
export const normalizeDrop = (p: Partial<GateSubPosition>): GateSubPosition => ({
  etw: /^\d{4}-\d{2}-\d{2}$/.test(p.etw ?? "") ? p.etw! : "",
  qty: numOrNull(p.qty),
  packing: p.packing ?? "",
  width: numOrNull(p.width),
  length: numOrNull(p.length),
  height: numOrNull(p.height),
  description: p.description ?? "",
  weight: numOrNull(p.weight),
  measure: numOrNull(p.measure),
  totalGross: numOrNull(p.totalGross),
  plate: p.plate ?? "",
  driver: p.driver ?? "",
  transport: p.transport ?? "",
  vgm: !!p.vgm,
  vgmDate: p.vgm ? (p.vgmDate ?? "") : "",
  storageDays: numOrNull(p.storageDays),
});

// Always the three legs in order, whatever was stored.
export const normalizeLegs = (legs: GateTransportLeg[] | null | undefined): GateTransportLeg[] =>
  LEGS.map((leg) => ({ leg, company: "", plate: "", driver: "", phone: "", gateTime: "", ...(legs ?? []).find((l) => l.leg === leg) }));

// Release-gate set by operation type, as on the warehouse position (LCL vs FCL).
// The Customs line follows the customs status: cargo is blocked by customs until cleared.
// Outbound cargo of a position linked to a shipment also waits for the pick-up PIN
// (`pickupPin`): that line is set only by the PIN check at the gate.
export function defaultReleaseGates(handling: string, operationType: string, customsStatus: string, pickupPin = false): GateReleaseLine[] {
  const gates = baseReleaseGates(handling, operationType, customsStatus);
  return pickupPin && !isDomestic(handling) ? [...gates, pickupPinLine()] : gates;
}

function baseReleaseGates(handling: string, operationType: string, customsStatus: string): GateReleaseLine[] {
  // Domestic: nothing customs-related (no Customs, B/L, MRN or VGM line); the exceptions hold is
  // added by the exceptions themselves, as for every position.
  if (isDomestic(handling)) {
    return [
      { g: "Charges", s: "OK", note: "nothing disputed" },
      { g: "Storage settled", s: "OK", note: "within free time" },
    ];
  }
  if (!isFcl(operationType)) {
    return [
      { g: "B/L / release order", s: handling === "Import" ? "Pending" : "OK", note: handling === "Import" ? "original or telex awaited" : "export — n/a" },
      customsLine(customsStatus),
      { g: "Charges", s: "OK", note: "nothing disputed" },
      { g: "Storage settled", s: "OK", note: "within free time" },
    ];
  }
  return [
    { g: handling === "Import" ? "Delivery order + PIN from carrier" : "Booking confirmation", s: "Pending", note: "—" },
    customsLine(customsStatus),
    { g: "Charges", s: "OK", note: "—" },
    { g: handling === "Export" ? "VGM submitted" : "Storage settled", s: "Pending", note: "—" },
    { g: "Interchange signed", s: "Pending", note: `gate ${handling === "Import" ? "out" : "in"} pass` },
    { g: "Empty return planned", s: "Pending", note: "depot slot + receipt stops the detention clock" },
  ];
}

// The release tick is a view of the release gates, never set by hand; the empty-return
// line does not hold cargo release. A refusal disarms, a supervisor override (with reason)
// arms. An open damage / short / over exception holds the cargo until resolved, unless a
// supervisor overrides (the override wins, as for every other release line).
// The old hand-set release status is no longer read (migration 0013 cleared it).
export function isArmed(m: Pick<GateMovementRow, "status" | "overridden" | "releaseGates"> & { pickupShipmentId?: string | null }): boolean {
  if (m.status === "Refused") return false;
  if (m.overridden) return true;
  if (exceptionHold(m.releaseGates)) return false;
  // Cargo of a shipment released against its pick-up PIN needs the PIN line OK, even if the line is gone.
  if (m.pickupShipmentId && !m.releaseGates.some((x) => x.g === PICKUP_PIN_GATE && x.s === "OK")) return false;
  return !m.releaseGates.some((x) => x.s !== "OK" && !/empty return/i.test(x.g));
}

// Need attention = outgoing cargo (výdej) that cannot be released yet, or outgoing cargo
// still under customs (not cleared) with no MRN recorded. Incoming cargo and cleared cargo
// never need an MRN here, and cargo already released or gone out no longer needs attention.
export function needsAttention(
  m: Pick<GateMovementRow, "visit" | "mrn" | "customsStatus" | "status" | "overridden" | "releaseGates" | "impRelease" | "gateOut"> & { handling?: string },
): boolean {
  if (m.visit !== "výdej" || m.impRelease || m.gateOut) return false;
  // Domestic cargo has no customs: only a blocked release counts.
  if (isDomestic(m.handling)) return !isArmed(m);
  const noMrn = !m.mrn.trim() || m.mrn === "—";
  return !isArmed(m) || (m.customsStatus !== CUSTOMS_CLEARED && noMrn);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

type ContainerRef = { id: string; number: string; equipment: string };

export const reweighItem = (r: WarehouseReweighRecord): GateReweighItem => ({
  id: r.id,
  movementId: r.movementId,
  weighedKg: r.weighedKg,
  declaredKg: r.declaredKg,
  declaredSource: r.declaredSource,
  variancePct: r.variancePct,
  flagged: r.flagged,
  weighedBy: r.weighedBy,
  weighedAt: r.weighedAt.toISOString(),
  fileIds: Array.isArray(r.fileIds) ? r.fileIds : [],
  note: r.note,
  createdAt: r.createdAt.toISOString(),
});

/** The container house and re-weighings of a record, read with it. */
export interface MovementExtras {
  house?: HouseCtx | null;
  /** Latest first. */
  reweighs?: WarehouseReweighRecord[];
}

// What the gate shows of the shipment's pick-up: status, tries and the haulier rows to compare
// with the truck. Never the PIN itself, so the check at the gate is a real check.
const pickupInfo = (p: PickupData): GatePickupInfo => ({
  pinSet: hasPickupPin(p),
  tries: p.pinTries,
  locked: hasPickupPin(p) && p.pinTries >= MAX_PIN_TRIES,
  pinCreatedAt: p.pinCreatedAt,
  pinCreatedBy: p.pinCreatedBy,
  rows: p.rows,
});

export const exceptionItem = (e: WarehouseExceptionRecord): GateExceptionItem => ({
  id: e.id,
  movementId: e.movementId,
  taskId: e.taskId ?? null,
  type: e.type,
  pieces: e.pieces,
  note: e.note,
  container: e.container,
  surveyPhase: e.surveyPhase,
  source: e.source,
  fileIds: Array.isArray(e.fileIds) ? e.fileIds : [],
  status: e.status,
  createdBy: e.createdBy,
  createdAt: e.createdAt.toISOString(),
  resolvedAt: iso(e.resolvedAt),
  resolvedBy: e.resolvedBy,
  resolutionNote: e.resolutionNote,
});

// The "Storage settled" line shows the storage clock in its note (display only: the stored
// gates keep their own note, and the line stays a manual tick).
const withStorageNote = (gates: GateMovementRow["releaseGates"], storage: StorageInfo) =>
  gates.map((g) => (g.g === "Storage settled" ? { ...g, note: storageNote(storage) } : g));

// `pickup` is the shipment's pick-up section; it is read only for linked outbound rows, whose
// PIN state then comes from it instead of the gate row's own PIN. `outbox` are the record's
// shipment updates not delivered yet; `exceptions` its damage / short / over exceptions.
function toItem(
  m: GateMovementRow,
  containers: ContainerRef[] = [],
  pickup?: PickupData,
  outbox: ShipmentOutboxRecord[] = [],
  exceptions: WarehouseExceptionRecord[] = [],
  now = new Date(),
  dockSlots: GateDockSlot[] = [],
  extras: MovementExtras = {},
): GateMovementItem {
  const { pinHash, companyId: _companyId, deletedAt, releaseStatus: _releaseStatus, shipmentCheckedAt, receivedAt, leftAt, ...rest } = m;
  const pick = isLinkedOutbound(m) ? pickupInfo(pickup ?? readPickup(null)) : null;
  const storage = movementStorage(m, now);
  const house = extras.house ?? null;
  const reweighs = (extras.reweighs ?? []).map(reweighItem);
  const armed = isArmed(m);
  return {
    ...rest,
    receivedAt: iso(receivedAt),
    leftAt: iso(leftAt),
    leftContainerId: m.leftContainerId ?? null,
    lifecycle: positionLifecycle(
      m,
      armed,
      // An old one-position import container keeps the received date typed by hand.
      house && (isExportContainer(house.container) || tallyRequired(house))
        ? { stuffedAt: house.link.stuffedAt, tickedAt: house.link.tickedAt, tallyOutcome: house.link.tallyOutcome, containerGateInAt: house.container.gateInAt }
        : null,
    ),
    container: house ? positionContainer(house) : null,
    needsReweigh: needsReweigh(m),
    reweigh: reweighs[0] ?? null,
    reweighs,
    releaseGates: withStorageNote(m.releaseGates, storage),
    storage,
    exceptions: exceptions.map(exceptionItem),
    openExceptions: exceptions.filter((e) => e.status === "open").length,
    dockSlots,
    containers: containers.map((c) => ({ id: c.id, number: c.number, type: c.equipment })),
    transportLegs: normalizeLegs(m.transportLegs),
    tripFigures: tripFiguresOf(m.transportLegs),
    surveys: m.surveys.map(normalizeSurvey),
    subPositions: m.subPositions.map(normalizeDrop),
    positionRef: m.positionRef ?? "",
    shipmentId: m.shipmentId ?? null,
    hasPin: pick ? pick.pinSet : !!pinHash,
    pinTries: pick ? pick.tries : m.pinTries,
    pinLocked: pick ? pick.locked : m.pinTries >= MAX_PIN_TRIES,
    pickup: pick,
    armed,
    needsAttention: needsAttention(m),
    gateIn: iso(m.gateIn),
    gateOut: iso(m.gateOut),
    impRelease: iso(m.impRelease),
    expDraft: iso(m.expDraft),
    expReceipt: iso(m.expReceipt),
    archivedAt: iso(deletedAt),
    shipmentCheckedAt: iso(shipmentCheckedAt),
    shipmentUpdate: shipmentUpdateState(outbox),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

// HH:MM in the warehouse's local time, for the human-readable log lines.
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(d);
const stampText = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", dateStyle: "short", timeStyle: "short" }).format(d);

// Fields the general update never writes: status and release follow the stamps, the release
// gates, Refuse and the supervisor override, each logged through its own endpoint. Dropped
// even if a client sends them (the request type no longer has them).
const NOT_EDITABLE = ["pickupShipmentId", "status", "releaseGates", "releaseStatus", "overridden", "refusalLog", "overrideLog", "gateIn", "gateOut", "impRelease", "expDraft", "expReceipt", "events", "pinTries", "pinHash", "surveys"];

const t = gateMovementTable;
const DIRECTION_LOCKED = "Direction cannot change once a gate stamp is recorded";
// The release gates of a position whose direction changes (before any stamp): the defaults of the
// new handling, keeping the lines that follow something else — the "No open exceptions" hold of an
// open exception and the Pick-up PIN line (dropped or added right after, as the link says).
// Built on the stored gates in SQL, so an exception opened meanwhile keeps its hold.
const rebuiltGatesSql = (handling: string, operationType: string, customsStatus: string) =>
  sql`${JSON.stringify(defaultReleaseGates(handling, operationType, customsStatus))}::jsonb || COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(${t.releaseGates}) x
    WHERE x->>'g' IN (${EXCEPTION_GATE}, ${PICKUP_PIN_GATE})), '[]'::jsonb)`;
// Short waits (30 ms each) a PIN check makes for a try held by a parallel right PIN.
const PIN_BUSY_WAITS = 10;
const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
const sameTime = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();
// isArmed in SQL, so the release checks the gates as they are at the moment of the UPDATE
// (customs can change between loading the row and stamping it).
// Safety net: a linked outbound row is released only with its Pick-up PIN line OK, even if the
// line went missing from the gates (a supervisor override still clears it). An open damage /
// short / over exception holds the cargo unless a supervisor overrides.
const armedSql = sql`${t.status} <> 'Refused' AND (${t.overridden} OR NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(${t.releaseGates}) x
  WHERE COALESCE(x->>'s', '') <> 'OK' AND COALESCE(x->>'g', '') !~* 'empty return'))
  AND (${t.overridden} OR NOT ${linkedOutboundCond} OR ${pickupLineOkSql})
  AND (${t.overridden} OR ${t.pickupShipmentId} IS NULL OR ${pickupLineOkSql})
  AND (${t.overridden} OR ${noOpenExceptionSql})`;
const PICKUP_PIN_FROM_SHIPMENTS = "This movement uses the pick-up PIN from Shipments";
const NOT_RECEIVED_YET = "The cargo has not arrived yet — stamp the gate-in or the WH receipt before the WH release";
const isManagerRole = (role: string) => role === "manager" || role === "admin" || role === "superadmin";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Outgoing cargo (výdej) leaves only through WH release, which stamps the gate-out too; a
// gate-out of its own would skip the release gates.
const OUT_NEEDS_RELEASE = "Outgoing cargo leaves through WH release (it stamps the gate-out too) — stamp WH release first";
const DOMESTIC_OUT_NEEDS_RELEASE = "Domestic cargo leaves through WH release (it stamps the gate-out too) — stamp WH release first";
// Domestic cargo: the gate-in is the receipt (owner decision 16 Oct 2026).
const DOMESTIC_NO_RECEIPT = "Domestic cargo has no draft receipt or receipt — its gate-in is the receipt";

/** What a stamp check reads besides the row: the container house and whether it is re-weighed. */
export interface StampContext {
  house?: HouseCtx | null;
  reweighed?: boolean;
}

// Why a stamp cannot be taken on the row as it is now; null when it can.
function stampBlocked(m: GateMovementRow, kind: StampKind, ctx: StampContext = {}): string | null {
  switch (kind) {
    case "gateIn":
      return m.gateIn ? "Gate-in already stamped" : null;
    case "gateOut":
      if (m.gateOut) return "Gate-out already stamped";
      if (isDomestic(m.handling) && !m.impRelease) return DOMESTIC_OUT_NEEDS_RELEASE;
      return m.visit === "výdej" && !m.impRelease ? OUT_NEEDS_RELEASE : null;
    case "impRelease":
      if (m.impRelease) return "WH release already stamped";
      // Inbound cargo (příjem) is released only after it arrived.
      if (m.visit === "příjem" && !m.gateIn && !m.expReceipt && !m.receivedAt) return NOT_RECEIVED_YET;
      {
        const house = houseBlocksRelease(m, ctx.house);
        if (house) return house;
      }
      if (!m.overridden && exceptionHold(m.releaseGates)) return "On hold — an open damage / short / over exception must be resolved before the WH release";
      return isArmed(m) ? null : "Release box NOT armed — gate must refuse. Use supervisor override only with reason.";
    case "expDraft":
      if (m.expDraft) return "Draft receipt already created";
      return isDomestic(m.handling) ? DOMESTIC_NO_RECEIPT : null;
    case "expReceipt":
      if (isDomestic(m.handling) && !m.expReceipt) return DOMESTIC_NO_RECEIPT;
      if (!m.expDraft) return "Create the draft receipt first";
      if (m.expReceipt) return "WH receipt already confirmed";
      return needsReweigh(m) && !ctx.reweighed ? REWEIGH_FIRST : null;
  }
}

const STAMP_LABEL: Record<StampKind, string> = {
  gateIn: "Gate-in",
  gateOut: "Gate-out",
  impRelease: "WH release",
  expDraft: "WH draft receipt",
  expReceipt: "WH receipt",
};

/** Floor mode (phones): the time the stamp was made on the phone and the id of the request. */
export interface StampOptions {
  recordedAt?: string;
  clientRequestId?: string;
}

// A stamp request with an id that finds its stamp already there: the same request came before
// (its event carries the id — even if a manager voided the stamp since, it is not stamped again),
// or another clerk stamped first. Null when the column is still empty and the id is new.
function stampConflict(m: GateMovementRow, kind: StampKind, requestId: string): { outcome: StampOutcome; notice: string } | null {
  const mine = m.events.find((e) => e.requestId === requestId);
  if (mine) {
    return { outcome: "already_stamped", notice: `${STAMP_LABEL[kind]} was already sent from this phone (stamped ${pragueHhmm(new Date(mine.at))})` };
  }
  const value = m[kind];
  if (!value) return null;
  const evt = [...m.events].reverse().find((e) => e.kind === kind);
  const who = evt?.by ? ` by ${evt.by}` : "";
  return { outcome: "stamped_by_someone_else", notice: `${STAMP_LABEL[kind]} was already stamped ${pragueHhmm(value)}${who}` };
}

// The step a stamp made offline must not come before: a WH receipt after its draft, a gate-out
// after the arrival (gate-in, receipt) and the WH release.
function stampNotBefore(m: GateMovementRow, kind: StampKind): { notBefore: Date | null; after: string } {
  switch (kind) {
    case "expDraft":
      // An export arrival may set the gate-in itself; one stamped before stays first.
      return { notBefore: m.gateIn, after: "the gate-in" };
    case "expReceipt": {
      const notBefore = latest(m.gateIn, m.expDraft);
      const afterDraft = !!m.expDraft && notBefore?.getTime() === m.expDraft.getTime();
      return { notBefore, after: afterDraft ? "the draft receipt" : "the gate-in" };
    }
    case "gateOut":
      return { notBefore: latest(m.gateIn, m.expReceipt, m.impRelease), after: "the arrival / release" };
    default:
      return { notBefore: null, after: "" };
  }
}


// One shipment update owed by a stamp of `m`, sent later as `userId` with `role`.
function outboxRow(
  m: GateMovementRow,
  kind: NewShipmentOutboxRecord["kind"],
  stamp: StampKind,
  payload: Record<string, string>,
  userId: string,
  role: string,
): NewShipmentOutboxRecord {
  return { companyId: m.companyId, movementId: m.id, shipmentId: m.shipmentId!, kind, stamp, payload, actingUserId: userId, actingRole: role };
}

/** Rows by the movement they belong to. */
function groupByMovement<R extends { movementId: string | null }>(rows: R[]): Map<string, R[]> {
  const byMovement = new Map<string, R[]>();
  for (const row of rows) {
    if (!row.movementId) continue;
    const list = byMovement.get(row.movementId);
    if (list) list.push(row);
    else byMovement.set(row.movementId, [row]);
  }
  return byMovement;
}

class GateMovementService {
  // The Gate Log. `archived` lists archived records only. Reads only — the customs status of
  // linked records is brought up to date by followShipments (its own POST endpoint).
  async list(companyId: string, opts: { archived?: boolean } = {}) {
    const movements = opts.archived ? await gateMovementRepository.listArchived(companyId) : await gateMovementRepository.listAll(companyId);
    const ids = movements.map((m) => m.id);
    const linked = [...new Set(movements.filter(isLinkedOutbound).map((m) => m.shipmentId!))];
    // The related rows of every listed movement, read at the same time (none depends on another).
    const [containers, outbox, exceptions, slots, houses, reweighs, sections] = await Promise.all([
      containerRepository.listForMovements(ids, companyId),
      shipmentOutboxRepository.openForMovements(ids, companyId),
      gateExceptionRepository.listForMovements(ids, companyId),
      dockSlotRepository.listForMovements(ids, companyId),
      houseContexts(ids, companyId),
      reweighRepository.listForMovements(ids, companyId),
      warehouseSectionRepository.findPickupForShipments(linked, companyId),
    ]);
    // Grouped once by movement, instead of looking through all of them for every movement.
    const containersOf = groupByMovement(containers);
    const outboxOf = groupByMovement(outbox);
    const exceptionsOf = groupByMovement(exceptions);
    const slotsOf = groupByMovement(slots);
    const reweighsOf = groupByMovement(reweighs);
    const sectionOf = new Map(sections.map((x) => [x.shipmentId, x]));
    const pickupOf = (shipmentId: string | null) => readPickup(shipmentId ? sectionOf.get(shipmentId)?.data : undefined);
    const now = new Date();
    return movements.map((m) =>
      toItem(
        m,
        containersOf.get(m.id) ?? [],
        isLinkedOutbound(m) ? pickupOf(m.shipmentId) : undefined,
        outboxOf.get(m.id) ?? [],
        exceptionsOf.get(m.id) ?? [],
        now,
        dockSlotsOf(slotsOf.get(m.id) ?? [], m.id),
        { house: houses.get(m.id), reweighs: reweighsOf.get(m.id) ?? [] },
      ),
    );
  }

  // A customs status read from the shipment can open or discharge the position's bonded entry
  // (Stock / Bonded register). Logged, never fails the read: "Build stock from gate records" repairs.
  private async stockAfterFollow(companyId: string, ids: string[]) {
    if (!ids.length) return;
    try {
      await syncStockForMovements(companyId, ids, { by: "Shipments", why: "customs status from the shipment" });
    } catch (err) {
      log.warn("warehouse: stock sync after the customs follow failed", { error: String(err) });
    }
  }

  // Before any action on a record (load): a linked outbound row without the Pick-up PIN line gets
  // it, and a row that stopped being linked outbound other than through update() (the task was
  // deleted or unlinked elsewhere) loses it. Rows made before the line existed got it from
  // migration 0020. Reads never write.
  private async ensurePickupLine(companyId: string, id: string) {
    const at = new Date().toISOString();
    await gateMovementRepository.dropPickupLine(
      companyId,
      { kind: "pickupPinLine", label: `${PICKUP_PIN_GATE} line removed — no longer a linked outbound movement`, at, by: "" },
      id,
    );
    await gateMovementRepository.ensurePickupLine(
      companyId,
      { kind: "pickupPinLine", label: `${PICKUP_PIN_GATE} line added — release waits for the pick-up PIN`, at, by: "" },
      id,
    );
  }

  // Reads the linked shipments' customs status into their gate records (a limited number of
  // records not read lately; with `id`, that record — when not read in the last half minute, or
  // always with `force`, "Refresh"). The only place gate records follow their shipments, so the
  // read endpoints never write. Returns how many records changed.
  async followShipments(companyId: string, opts: { id?: string; force?: boolean } = {}): Promise<number> {
    const movements = opts.id
      ? [await this.load(opts.id, companyId)]
      : await gateMovementRepository.listAll(companyId);
    const changed = opts.id
      ? await followCustoms(movements, companyId, { maxAgeMs: FOLLOW_ON_GET_MS, limit: 1, force: opts.force })
      : await followCustoms(movements, companyId, { maxAgeMs: FOLLOW_ON_LIST_MS, limit: FOLLOW_LIST_LIMIT });
    await this.stockAfterFollow(companyId, [...changed.keys()]);
    return changed.size;
  }

  // One record, live or archived. Reads only.
  async get(id: string, companyId: string) {
    const m = (await gateMovementRepository.findById(id, companyId)) ?? (await gateMovementRepository.findByIdAny(id, companyId));
    if (!m) throw APIError.notFound("Gate movement not found");
    const containers = await containerRepository.listForMovements([m.id], companyId);
    const pickup = isLinkedOutbound(m) ? readPickup((await warehouseSectionRepository.findPickup(m.shipmentId!, companyId))?.data) : undefined;
    const outbox = await shipmentOutboxRepository.openForMovements([m.id], companyId);
    const exceptions = await gateExceptionRepository.listForMovements([m.id], companyId);
    const slots = await dockSlotRepository.listForMovements([m.id], companyId);
    const house = (await houseContexts([m.id], companyId)).get(m.id);
    const reweighs = await reweighRepository.listForMovements([m.id], companyId);
    return toItem(m, containers, pickup, outbox, exceptions, new Date(), dockSlotsOf(slots, m.id), { house, reweighs });
  }

  // Every action reads the row through here, so it always sees the Pick-up PIN line when the
  // row is linked outbound.
  private async load(id: string, companyId: string) {
    await this.ensurePickupLine(companyId, id);
    const m = await gateMovementRepository.findById(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    return m;
  }

  // What the stamp checks read besides the row: its container house and its re-weighing.
  private async stampContext(m: GateMovementRow, companyId: string): Promise<StampContext> {
    const house = (await houseContexts([m.id], companyId)).get(m.id) ?? null;
    const reweighed = needsReweigh(m) ? !!(await reweighRepository.latestForMovement(m.id, companyId)) : true;
    return { house, reweighed };
  }

  // Display name of the acting user for the gate log. Users live in the auth service.
  private async userName(userId: string): Promise<string> {
    return userName(userId);
  }

  private async fields(input: GateMovementInput, companyId: string): Promise<Partial<NewGateMovementRecord>> {
    const { pin, warehouseTaskId, transportLegs, subPositions, ...rest } = input;
    const out: Partial<NewGateMovementRecord> = { ...rest };
    for (const key of NOT_EDITABLE) delete (out as Record<string, unknown>)[key];
    // Only a Trucking trip marks a leg (expect-arrival / expect-departure); a client's marker is dropped.
    if (transportLegs !== undefined) out.transportLegs = normalizeLegs(transportLegs).map(({ source: _source, figures: _figures, ...leg }) => leg);
    if (subPositions !== undefined) {
      if (subPositions.length > MAX_SUB_POSITIONS) throw APIError.invalidArgument(`At most ${MAX_SUB_POSITIONS} sub-positions (drops)`);
      out.subPositions = subPositions.map(normalizeDrop);
    }
    if (warehouseTaskId !== undefined) {
      if (warehouseTaskId && !(await gateMovementRepository.findTask(warehouseTaskId, companyId))) {
        throw APIError.invalidArgument("Warehouse task not found");
      }
      out.warehouseTaskId = warehouseTaskId || null;
    }
    if (out.loadInDate !== undefined) {
      out.loadInDate = out.loadInDate.trim();
      if (out.loadInDate && !isIsoDate(out.loadInDate)) throw APIError.invalidArgument("Received in warehouse must be a date (YYYY-MM-DD)");
    }
    if (out.freeDays !== undefined && out.freeDays !== null && (!Number.isInteger(out.freeDays) || out.freeDays < 0 || out.freeDays > MAX_FREE_DAYS)) {
      throw APIError.invalidArgument(`Free days must be a whole number from 0 to ${MAX_FREE_DAYS} (empty = the default)`);
    }
    if (pin !== undefined) {
      if (pin && !/^\d{4}$/.test(pin)) throw APIError.invalidArgument("PIN must be 4 digits");
      out.pinHash = pin ? await hash(pin) : null;
      out.pinTries = 0;
    }
    return out;
  }

  // The new record as it will be stored (checked and filled in), not saved yet — so callers can
  // insert it in a transaction of their own (a new position and its gate row together).
  async buildRecord(companyId: string, userId: string, input: GateMovementInput & { walkIn?: boolean }): Promise<NewGateMovementRecord> {
    const { walkIn, ...rest } = input;
    const data = await this.fields(rest, companyId);
    const handling = data.handling ?? "Import";
    const operationType = data.operationType ?? "LCL consolidation";
    const customsMode = data.customsMode ?? "SCP";
    const customsStatus = data.customsStatus ?? CUSTOMS_STATUSES[0]!;
    const now = new Date();

    let gateRef = data.gateRef?.trim() ?? "";
    if (!gateRef && data.warehouseTaskId) {
      gateRef = (await gateMovementRepository.findTask(data.warehouseTaskId, companyId))?.taskId ?? "";
    }
    if (walkIn) gateRef ||= "— walk-in";
    if (!gateRef) throw APIError.invalidArgument("Gate ref is required unless a warehouse task is linked");
    // Outbound cargo of a position linked to a shipment is released against the pick-up PIN.
    const task = data.warehouseTaskId ? await gateMovementRepository.findTask(data.warehouseTaskId, companyId) : null;
    const pickupPin = (data.visit ?? "příjem") === "výdej" && !!task?.shipmentId;
    if (pickupPin && rest.pin) throw APIError.invalidArgument(PICKUP_PIN_FROM_SHIPMENTS);

    const by = await this.userName(userId);
    const events: GateEvent[] = [
      { kind: walkIn ? "walkIn" : "created", label: walkIn ? "Walk-in at the gate — unlinked, ops notified" : "Movement created", at: now.toISOString(), by },
    ];
    return {
      ...data,
      companyId,
      gateRef,
      handling,
      operationType,
      customsMode,
      customsStatus,
      transportLegs: data.transportLegs ?? normalizeLegs([]),
      updatedBy: by,
      checklist: { ...DEFAULT_CHECKLIST, ...(data.checklist ?? {}) },
      releaseGates: defaultReleaseGates(handling, operationType, customsStatus, pickupPin),
      pickupShipmentId: pickupPin ? task!.shipmentId : null,
      events,
      ...(walkIn
        ? {
            status: "Expected",
            customer: data.customer || "(unknown — no pre-advice)",
            shipmentOwner: data.shipmentOwner || "— notify ops",
            customsDocs: data.customsDocs || "None",
            gateIn: now,
          }
        : {}),
    };
  }

  async create(companyId: string, userId: string, input: GateMovementInput & { walkIn?: boolean }) {
    const record = await this.buildRecord(companyId, userId, input);
    const id = await db.transaction(async (tx) => {
      const row = await gateMovementRepository.create(record, tx);
      // A record saved as already received (an outbound record with a typed received date and no
      // container tally) gets its stock line and bonded entry now; otherwise this does nothing.
      await syncStockForMovement(tx, companyId, row.id, { by: record.updatedBy ?? "", why: "gate record created" });
      return row.id;
    });
    return this.get(id, companyId);
  }

  // `linkChangeReason`: a manager changing the task link or direction of a position linked to a
  // shipment (before its release) must give one; it is logged.
  async update(id: string, companyId: string, userId: string, input: GateMovementInput, role = "user", linkChangeReason = "") {
    const m = await this.load(id, companyId);
    const patch = await this.fields(input, companyId);
    // A leg filled by a Trucking trip is read-only here: it stays as the trip set it.
    if (patch.transportLegs) patch.transportLegs = protectTripLegs(m.transportLegs, patch.transportLegs);

    // Direction is held twice — handling (Import / Export / Domestic) and the gate visit (výdej /
    // příjem) the gate rules follow — so they change together, and only before any stamp (owner
    // decision 16 Oct 2026, also into or out of Domestic). The release gates are then rebuilt with
    // the defaults of the new handling (see rebuiltGatesSql), in the save's transaction.
    const handlingChanged = input.handling !== undefined && input.handling !== m.handling;
    const visitChanged = input.visit !== undefined && input.visit !== m.visit;
    const house = (await houseContexts([id], companyId)).get(id) ?? null;
    if (handlingChanged || visitChanged) {
      if (hasStamp(m)) throw APIError.failedPrecondition(DIRECTION_LOCKED);
      if (house) throw APIError.failedPrecondition(`Direction cannot change while the position is in container ${house.container.number}`);
      if (handlingChanged && input.visit === undefined) patch.visit = visitOfHandling(input.handling!);
      if (visitChanged && input.handling === undefined) patch.handling = input.visit === "výdej" ? "Import" : "Export";
    }
    const directionChanged = (patch.handling ?? m.handling) !== m.handling || (patch.visit ?? m.visit) !== m.visit;

    // The UN number only exists for dangerous goods.
    if (input.dangerousGoods === false) patch.unNumber = "";
    // Customs status drives the Customs line of the release gate. It is set in SQL on the stored
    // gates (as the customs follow does), so a line changed meanwhile — the "No open exceptions"
    // hold of an exception created or resolved since the load, or the Pick-up PIN line — is kept.
    // (Domestic positions have no Customs line: setCustomsLineSql leaves them as they are.)
    const customsChanged = input.customsStatus !== undefined && input.customsStatus !== m.customsStatus;
    // The grid's carrier / driver / plate follow the leg the cargo moves on at this gate.
    if (patch.transportLegs) {
      const now = { visit: patch.visit ?? m.visit, handling: patch.handling ?? m.handling, gateIn: m.gateIn };
      const leg = patch.transportLegs.find((l) => l.leg === cargoLeg(now))!;
      patch.carrier = leg.company;
      patch.driver = leg.driver;
      patch.plate = leg.plate;
    }
    // A linked outbound row uses the pick-up PIN from Shipments, judged on the row as it will be
    // after this update (direction and task link may change in the same save).
    const shipmentAfter =
      patch.warehouseTaskId === undefined
        ? m.shipmentId
        : patch.warehouseTaskId
          ? ((await gateMovementRepository.findTask(patch.warehouseTaskId, companyId))?.shipmentId ?? null)
          : null;
    const linkedAfter = isLinkedOutbound({ shipmentId: shipmentAfter, visit: patch.visit ?? m.visit });
    if (input.pin && linkedAfter) throw APIError.invalidArgument(PICKUP_PIN_FROM_SHIPMENTS);
    patch.updatedBy = await this.userName(userId);
    // Unlinking the position, linking it elsewhere or flipping its direction would take a
    // shipment's cargo out of the pick-up PIN check (and out of the shipment's updates). Before the
    // release that is a manager's call, with a reason, logged.
    const taskChanged = patch.warehouseTaskId !== undefined && (patch.warehouseTaskId ?? null) !== (m.warehouseTaskId ?? null);
    const linkEvents: GateEvent[] = [];
    if ((m.shipmentId || m.pickupShipmentId) && !m.impRelease && (taskChanged || handlingChanged || visitChanged)) {
      const reason = linkChangeReason.trim();
      if (!isManagerRole(role)) {
        throw APIError.permissionDenied("This position is linked to a shipment — only a manager can change its link or direction (with a reason)");
      }
      if (!reason) throw APIError.invalidArgument("Give a reason for changing the link or direction of a position linked to a shipment");
      linkEvents.push({
        kind: "shipmentLinkChanged",
        label: taskChanged ? "Warehouse position link changed by a manager" : "Direction changed by a manager",
        at: new Date().toISOString(),
        by: patch.updatedBy,
        detail: reason,
      });
      patch.pickupShipmentId = linkedAfter ? shipmentAfter : null;
    } else if (linkedAfter && !m.pickupShipmentId) {
      patch.pickupShipmentId = shipmentAfter;
    }
    // A plate entered (or corrected) after the cargo of a linked record was released goes to the
    // shipment too, through the outbox like the release itself.
    // (Domestic cargo left on its OUT leg: that leg's plate.)
    const plateAfter = releasePlate({ handling: m.handling, plate: patch.plate ?? m.plate, transportLegs: patch.transportLegs ?? m.transportLegs });
    const plateLater = !!m.shipmentId && !!m.impRelease && !!plateAfter.trim() && plateAfter !== releasePlate(m);
    // The storage clock's inputs are logged (History): the received date of outbound cargo and the
    // position's own free days.
    const clockEvents: GateEvent[] = [];
    const clockAt = new Date().toISOString();
    if (patch.loadInDate !== undefined && patch.loadInDate !== m.loadInDate) {
      if (m.receivedAt || tallyRequired(house)) {
        throw APIError.failedPrecondition(
          `Received in warehouse is set by the stripping tally${house ? ` of container ${house.container.number}` : ""} — tick the house off there`,
        );
      }
      clockEvents.push({ kind: "storageClockChanged", label: `Received in warehouse: ${patch.loadInDate || "cleared"}`, at: clockAt, by: patch.updatedBy, detail: `was ${m.loadInDate || "—"}` });
    }
    if (patch.freeDays !== undefined && patch.freeDays !== m.freeDays) {
      clockEvents.push({
        kind: "storageClockChanged",
        label: `Free days: ${patch.freeDays ?? "default"}`,
        at: clockAt,
        by: patch.updatedBy,
        detail: `was ${m.freeDays ?? "default"}`,
      });
    }
    await db.transaction(async (tx) => {
      if (directionChanged) {
        // First, under the row lock: still no stamp (one taken meanwhile refuses the change).
        const rebuilt = await gateMovementRepository.conditionalUpdate(
          id,
          companyId,
          { releaseGates: rebuiltGatesSql(patch.handling ?? m.handling, patch.operationType ?? m.operationType, patch.customsStatus ?? m.customsStatus) },
          [{ kind: "releaseGatesRebuilt", label: `Release gates set for ${patch.handling ?? m.handling}`, at: new Date().toISOString(), by: patch.updatedBy ?? "", detail: `was ${m.handling}` }],
          sql`NOT ${hasStampSql}`,
          tx,
        );
        if (!rebuilt) throw APIError.failedPrecondition(DIRECTION_LOCKED);
      }
      await gateMovementRepository.update(id, companyId, patch, tx);
      if (customsChanged) await gateMovementRepository.conditionalUpdate(id, companyId, { releaseGates: setCustomsLineSql(customsLine(input.customsStatus!)) }, undefined, undefined, tx);
      if (clockEvents.length || linkEvents.length) await gateMovementRepository.appendEvents(id, companyId, [...linkEvents, ...clockEvents], tx);
      // Figures, customs mode / status, the received date or the operation type may change the
      // stock line and the bonded entry (in this transaction, after the row is updated and locked).
      await syncStockForMovement(tx, companyId, id, { by: patch.updatedBy ?? "", why: "gate record changed" });
      if (plateLater) {
        await shipmentOutboxRepository.enqueue(tx, [
          outboxRow(m, "plate", m.impRelease ? "impRelease" : "gateOut", { plateNumber: plateAfter.trim() }, userId, role),
        ]);
      }
    });
    if (plateLater) await deliverDue(id);
    // Direction or task link changed: the Pick-up PIN line follows (until the release).
    if (patch.visit !== undefined || patch.warehouseTaskId !== undefined) {
      const at = new Date().toISOString();
      await gateMovementRepository.dropPickupLine(
        companyId,
        { kind: "pickupPinLine", label: `${PICKUP_PIN_GATE} line removed — no longer a linked outbound movement`, at, by: patch.updatedBy },
        id,
      );
      // Linked outbound again (e.g. turned back to Import): the line comes back.
      await this.ensurePickupLine(companyId, id);
      // Linked to another shipment: a PIN verified for the old shipment does not count.
      if (linkedAfter && m.shipmentId && shipmentAfter && shipmentAfter !== m.shipmentId) {
        await gateMovementRepository.resetPickupLine(id, companyId, shipmentAfter, "linked to another shipment — check the PIN again", {
          kind: "pickupPinLine",
          label: `${PICKUP_PIN_GATE} back to Pending — linked to another shipment`,
          at,
          by: patch.updatedBy,
        });
      }
    }
    return this.get(id, companyId);
  }

  // "Use remeasured figures for the warehouse": the gate figures (pieces, gross kg, cbm) become
  // the totals of the position's remeasured lines — the warehouse's own figures only; the
  // shipment's cargo is never changed. Only on the lines as the client saw them
  // (`sectionVersion`), and not after the WH release. Logged with the old and new figures.
  async useRemeasured(id: string, companyId: string, userId: string, sectionVersion: number) {
    const m = await this.load(id, companyId);
    if (!m.warehouseTaskId) throw APIError.failedPrecondition("This gate record has no warehouse position");
    if (m.impRelease) throw APIError.failedPrecondition("The cargo is already released — the gate figures stay as released");
    const task = await gateMovementRepository.findTask(m.warehouseTaskId, companyId);
    if (!task) throw APIError.failedPrecondition("This gate record has no warehouse position");
    const section =
      (await warehouseSectionRepository.findByTask(task.id, "job", companyId)) ??
      (task.shipmentId ? await warehouseSectionRepository.findAdoptable(task.shipmentId, "job", companyId) : null);
    if (!section) throw APIError.failedPrecondition("No remeasured lines are saved for this position");
    const data = section.data && typeof section.data === "object" && !Array.isArray(section.data) ? (section.data as Record<string, unknown>) : {};
    let totals: RemeasureTotals;
    try {
      totals = remeasureTotals(data.remeasure_rows ?? "[]");
    } catch (err) {
      throw APIError.invalidArgument(inputMessage(err, "The remeasured lines cannot be read"));
    }
    if (!totals.pieces) throw APIError.failedPrecondition("No remeasured lines are saved for this position");
    const by = await this.userName(userId);
    const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
    const detail = `pieces ${m.colli}→${totals.pieces} · kg ${fmt(m.weightKg)}→${fmt(totals.weightKg)} · cbm ${fmt(m.measureCbm)}→${fmt(totals.cbm)}`;
    const row = await db.transaction(async (tx) => {
      // The lines must still be the ones the client saw, and stay so until the figures are written.
      const [same] = await tx
        .select({ id: warehouseSectionTable.id })
        .from(warehouseSectionTable)
        .where(sql`${warehouseSectionTable.id} = ${section.id} AND ${warehouseSectionTable.version} = ${sectionVersion} AND ${warehouseSectionTable.deletedAt} IS NULL`)
        .for("share");
      if (!same) throw APIError.aborted("The remeasured lines changed meanwhile — reload and try again");
      const updated = await gateMovementRepository.conditionalUpdate(
        id,
        companyId,
        { colli: totals.pieces, weightKg: totals.weightKg, measureCbm: totals.cbm, updatedBy: by },
        [{ kind: "gateFiguresFromRemeasurement", label: "Gate figures set from the remeasurement", at: new Date().toISOString(), by, detail }],
        sql`${t.impRelease} IS NULL`,
        tx,
      );
      if (updated) await syncStockForMovement(tx, companyId, id, { by, why: "gate figures from the remeasurement" });
      return updated;
    });
    if (!row) throw APIError.failedPrecondition("The cargo was released meanwhile — the gate figures stay as released");
    return this.get(id, companyId);
  }

  // Saves the survey of one container (or the position when it has no container) for one
  // pass — receipt or release — and records who surveyed it and when. Damaged / lost are
  // capped to the pieces on the movement only when those are known (pieces > 0).
  async saveSurvey(id: string, companyId: string, userId: string, survey: GateSurveyInput, opts: StampOptions = {}) {
    return (await this.saveSurveyWithOutcome(id, companyId, userId, survey, opts)).movement;
  }

  // The survey save as the endpoint answers it. Floor mode may send it later than it was made
  // (offline queue, `recordedAt` = the time on the phone, logged as recorded offline). The latest
  // survey wins: a save older than the one stored for that container and pass changes nothing
  // ("newer_exists"), and the same request sent again is recognised by its id ("already_saved").
  async saveSurveyWithOutcome(
    id: string,
    companyId: string,
    userId: string,
    survey: GateSurveyInput,
    opts: StampOptions = {},
  ): Promise<{ movement: GateMovementItem; outcome: SurveyOutcome; notice: string }> {
    if (!SURVEY_PHASES.includes(survey.phase)) throw APIError.invalidArgument(`Survey phase must be one of: ${SURVEY_PHASES.join(", ")}`);
    const requestId = checkRequestId(opts.clientRequestId);
    const m = await this.load(id, companyId);
    const key = surveyPhaseKey(survey.phase);
    const passName = `${key}${survey.container ? `, ${survey.container}` : ""}`;
    const storedOf = (row: Pick<GateMovementRecord, "surveys">) =>
      row.surveys.find((e) => e.container === survey.container && surveyPhaseKey(e.phase) === key);
    const answer = async (stored: GateSurvey | undefined): Promise<{ movement: GateMovementItem; outcome: SurveyOutcome; notice: string }> => {
      const movement = await this.get(id, companyId);
      if (requestId && stored?.requestId === requestId) {
        return { movement, outcome: "already_saved", notice: `Survey (${passName}) was already sent from this phone` };
      }
      const when = stored?.surveyedAt ? pragueHhmm(new Date(stored.surveyedAt)) : "";
      return {
        movement,
        outcome: "newer_exists",
        notice: `A newer survey (${passName}) was saved${when ? ` at ${when}` : ""}${stored?.surveyedBy ? ` by ${stored.surveyedBy}` : ""} — this one was not applied`,
      };
    };
    if (requestId && storedOf(m)?.requestId === requestId) return answer(storedOf(m));

    const now = new Date();
    const at = opts.recordedAt ? acceptRecordedAt(opts.recordedAt, now, { requestId }) : now;
    const pieces = m.colli;
    const clamp = (n: number) => {
      const v = Math.max(0, Math.floor(n || 0));
      return pieces > 0 ? Math.min(v, pieces) : v;
    };
    const by = await this.userName(userId);
    const record: GateSurvey = {
      container: survey.container,
      phase: survey.phase,
      damaged: clamp(survey.damaged),
      lost: clamp(survey.lost),
      lines: normalizeSurvey({ ...survey, surveyedAt: "", surveyedBy: "" }).lines,
      driverNote: survey.driverNote,
      warehouseNote: survey.warehouseNote,
      surveyedAt: at.toISOString(),
      surveyedBy: by,
      ...(requestId ? { requestId } : {}),
    };
    // One statement replaces this container's survey of this pass, so two tablets saving
    // different containers (or passes) at once do not overwrite each other. It lands only while
    // the stored survey of that container and pass is not newer (and not this very request).
    const samePass = (e: SQL) => sql`(${e}->>'container' = ${survey.container}
        AND (CASE WHEN ${e}->>'phase' ~ '^Release' THEN 'release' ELSE 'receipt' END) = ${key})`;
    const kept = sql`COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(${t.surveys}) e
      WHERE NOT ${samePass(sql`e`)}), '[]'::jsonb)`;
    const notNewer = sql`NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${t.surveys}) s
      WHERE ${samePass(sql`s`)}
        AND ((s->>'surveyedAt' ~ '^[0-9]{4}-' AND (s->>'surveyedAt')::timestamptz > ${at.toISOString()}::timestamptz)
          ${requestId ? sql`OR s->>'requestId' = ${requestId}` : sql``}))`;
    const events: GateEvent[] | undefined = opts.recordedAt
      ? [{ kind: "surveySaved", label: `Survey saved (${passName})`, at: at.toISOString(), by, detail: offlineDetail(at, now), ...(requestId ? { requestId } : {}) }]
      : undefined;
    const row = await gateMovementRepository.conditionalUpdate(id, companyId, { surveys: sql`${kept} || ${json([record])}`, updatedBy: by }, events, notNewer);
    if (!row) {
      const cur = await gateMovementRepository.findById(id, companyId);
      if (!cur) throw APIError.notFound("Gate movement not found");
      return answer(storedOf(cur));
    }
    const notice = opts.recordedAt ? `Survey (${passName}) saved — recorded offline at ${pragueHhmm(at)}` : "";
    return { movement: await this.get(id, companyId), outcome: "saved", notice };
  }

  // Any user may delete a record the gate never stamped (it moves to the archive, logged). A
  // stamped record is evidence: only a manager archives it, with a reason (gateAdminService).
  async remove(id: string, companyId: string, userId: string) {
    const by = await this.userName(userId);
    // Not deleted (stamped meanwhile, or gone): the houses stay as they were.
    const notDeleted = new Error("not deleted");
    let row: GateMovementRecord | null = null;
    try {
      row = await db.transaction(async (tx) => {
        await releaseHousesForArchive(tx, [id], companyId, by, "the position was deleted");
        const archived = await gateMovementRepository.archive(
          id,
          companyId,
          by,
          "",
          { kind: "deleted", label: "Deleted", at: new Date().toISOString(), by },
          sql`NOT ${hasStampSql}`,
          tx,
        );
        if (!archived) throw notDeleted;
        // Outbound cargo received by its typed date only has no stamp: its stock line closes here.
        await syncStockForMovement(tx, companyId, id, { by, why: "position deleted" });
        return archived;
      });
    } catch (err) {
      if (err !== notDeleted) throw err;
    }
    if (row) return;
    const cur = await gateMovementRepository.findById(id, companyId);
    if (!cur) throw APIError.notFound("Gate movement not found");
    throw APIError.failedPrecondition("This record has gate stamps — a manager can archive it with a reason");
  }

  // Gate stamps. Each one is final (only a manager voids one, with a reason) and files an event;
  // documents are append-only, so an export receipt keeps its draft (shown as superseded). Each
  // stamp is one conditional UPDATE (the column is set only while still empty), so of two clerks
  // stamping at once exactly one wins and the shipment is written back once.
  // The first export arrival stamp (draft receipt or receipt) is the receipt at the gate:
  // it also stamps gate-in when that is still empty, so the shipment gets its received date.
  // What the stamp owes the linked shipment is stored in the outbox in the same transaction and
  // sent straight after; if Shipments cannot take it now, it is retried (shipmentOutbox.service).
  // `role` is the stamping user's role, kept with the outbox row for the delivery.
  async stamp(id: string, companyId: string, userId: string, kind: StampKind, role = "user", opts: StampOptions = {}) {
    return (await this.stampWithOutcome(id, companyId, userId, kind, role, opts)).movement;
  }

  // The stamp as the endpoint answers it. Floor mode (phones) may send the stamp later than it was
  // made (offline queue): `recordedAt` is the time on the phone, accepted within a sane window
  // (offline.ts) and never before the step it follows; the stamp, its log and the shipment's
  // received date then carry that time, and the log says when it was recorded and sent.
  // The WH release is never taken from the queue: its release gates and PIN are the server's.
  // With a `clientRequestId`, a stamp that is already there is an answer, not an error: the same
  // request sent again ("already_stamped"), or another clerk was first ("stamped_by_someone_else").
  // Without one, an existing stamp is refused as before.
  async stampWithOutcome(
    id: string,
    companyId: string,
    userId: string,
    kind: StampKind,
    role = "user",
    opts: StampOptions = {},
  ): Promise<{ movement: GateMovementItem; outcome: StampOutcome; notice: string }> {
    const requestId = checkRequestId(opts.clientRequestId);
    if (opts.recordedAt && kind === "impRelease") {
      throw APIError.failedPrecondition("WH release needs a connection — it is checked against the release gates when it is stamped");
    }
    const m = await this.load(id, companyId);
    const known = requestId ? stampConflict(m, kind, requestId) : null;
    if (known) return { movement: await this.get(id, companyId), ...known };
    const blocked = stampBlocked(m, kind, await this.stampContext(m, companyId));
    if (blocked) throw APIError.failedPrecondition(blocked);
    const now = new Date();
    const at = opts.recordedAt ? acceptRecordedAt(opts.recordedAt, now, { ...stampNotBefore(m, kind), requestId }) : now;
    const offline = opts.recordedAt ? { detail: offlineDetail(at, now) } : {};
    const by = await this.userName(userId);
    const evt = (k: string, label: string, own = false): GateEvent => ({
      kind: k,
      label,
      at: at.toISOString(),
      by,
      ...offline,
      ...(own && requestId ? { requestId } : {}),
    });
    const toWarehouse = sql`CASE WHEN ${t.status} = 'Expected' THEN 'In Warehouse' ELSE ${t.status} END`;
    // Export arrival: gate-in too when it is still empty, logged before the stamp itself.
    const arrival = (own: GateEvent) => ({
      set: { gateIn: sql`COALESCE(${t.gateIn}, ${at.toISOString()}::timestamptz)` },
      events: sql`CASE WHEN ${t.gateIn} IS NULL THEN ${json([evt("gateIn", "Gate-in"), own])} ELSE ${json([own])} END`,
    });

    const { row, owed, published } = await db.transaction(async (tx) => {
      let row: GateMovementRecord | null = null;
      switch (kind) {
        case "gateIn":
          row = await gateMovementRepository.conditionalUpdate(id, companyId, { gateIn: at, status: toWarehouse }, [evt(kind, STAMP_LABEL.gateIn, true)], sql`${t.gateIn} IS NULL`, tx);
          break;
        case "gateOut":
          row = await gateMovementRepository.conditionalUpdate(
            id,
            companyId,
            { gateOut: at },
            [evt(kind, STAMP_LABEL.gateOut, true)],
            sql`${t.gateOut} IS NULL AND ((${t.visit} <> 'výdej' AND ${t.handling} <> ${DOMESTIC}) OR ${t.impRelease} IS NOT NULL)`,
            tx,
          );
          break;
        case "impRelease":
          // Its container (if any) and the position are locked first, so a stuffed mark or a tally
          // tick under way is seen by the release check below.
          await lockHouse(tx, id, companyId);
          row = await gateMovementRepository.conditionalUpdate(
            id,
            companyId,
            { impRelease: at, status: "Released", gateOut: sql`COALESCE(${t.gateOut}, ${at.toISOString()}::timestamptz)` },
            [evt(kind, STAMP_LABEL.impRelease, true)],
            sql`${t.impRelease} IS NULL AND ${armedSql} AND ${houseReleaseOkSql}`,
            tx,
          );
          break;
        case "expDraft": {
          const a = arrival(evt(kind, STAMP_LABEL.expDraft, true));
          row = await gateMovementRepository.conditionalUpdate(
            id,
            companyId,
            { ...a.set, expDraft: at, status: toWarehouse },
            a.events,
            sql`${t.expDraft} IS NULL AND ${t.handling} <> ${DOMESTIC}`,
            tx,
          );
          break;
        }
        case "expReceipt": {
          const a = arrival(evt(kind, STAMP_LABEL.expReceipt, true));
          row = await gateMovementRepository.conditionalUpdate(
            id,
            companyId,
            { ...a.set, expReceipt: at, status: toWarehouse },
            a.events,
            sql`${t.expReceipt} IS NULL AND ${t.expDraft} IS NOT NULL AND ${t.handling} <> ${DOMESTIC} AND ${reweighOkSql}`,
            tx,
          );
          break;
        }
      }
      if (!row) return { row, owed: [], published: 0 };
      // The warehouse-gate-stamped event (Trucking listens): what this very update stamped into the
      // gate-in / gate-out columns, written to the event outbox in this transaction and published
      // after the commit — a stamp that rolls back never publishes.
      const published = await enqueueGateEvents(
        tx,
        {
          companyId,
          movementId: id,
          positionId: m.positionRef ? m.warehouseTaskId : null,
          wczRef: m.positionRef ?? "",
          shipmentId: m.shipmentId,
          userId,
          stampKind: kind,
          at,
          // Arrival: the gate-in of cargo coming into the hub — inbound cargo, or cargo brought by a
          // Trucking pick-up run (an outbound gate-in otherwise is the pick-up truck). Departure:
          // the cargo leaves — once, with the stamp that lets it go (gateEvents.ts).
          stamped: { gateIn: gateInIsArrival(m) && !m.gateIn && sameTime(row.gateIn, at), gateOut: stampDeparts(m, kind) },
        },
        role,
      );
      // Write back only what this very update stamped. Received means inbound cargo arriving: an
      // outbound (výdej) gate-in is the pickup truck, not a receipt. (A výdej gate-out of its own
      // happens only on an already released row whose release left the gate-out empty.)
      // Positions without a shipment have nothing to update. (Export gate-out writes nothing back
      // yet — an open decision.) The dates are the Prague day the stamp was made (recorded), so
      // cargo received offline before midnight keeps its day.
      const owed: NewShipmentOutboxRecord[] = [];
      if (m.shipmentId) {
        const date = pragueDate(at);
        if (sameTime(row.gateIn, at) && m.visit !== "výdej") {
          owed.push(outboxRow(m, "received", "gateIn", { warehouseReceivedDate: date, ...(m.positionRef ? { warehouseReference: m.positionRef } : {}) }, userId, role));
        }
        if ((kind === "impRelease" && sameTime(row.gateOut, at)) || (kind === "gateOut" && row.visit === "výdej")) {
          // Domestic cargo leaves on its OUT leg (the line haul), not on the truck that brought it.
          const plate = releasePlate(row);
          owed.push(outboxRow(m, "released", kind, { warehouseReleasedDate: date, ...(plate ? { plateNumber: plate } : {}) }, userId, role));
        }
      }
      await shipmentOutboxRepository.enqueue(tx, owed);
      // The receipt opens the stock line (and bonded entry), the WH release closes them — in this
      // transaction, so a stamp and its stock line never drift apart (a replay changes nothing).
      await syncStockForMovement(tx, companyId, id, { by, at, why: STAMP_LABEL[kind] });
      return { row, owed, published };
    });
    if (!row) {
      // Someone else got there first (or the row is gone): report what the row says now.
      const cur = await this.load(id, companyId);
      const raced = requestId ? stampConflict(cur, kind, requestId) : null;
      if (raced) return { movement: await this.get(id, companyId), ...raced };
      throw APIError.failedPrecondition(stampBlocked(cur, kind, await this.stampContext(cur, companyId)) ?? `${kind} could not be stamped — reload and try again`);
    }
    if (owed.length) await deliverDue(id);
    if (published) await deliverGateEvents(id);
    const notice = opts.recordedAt ? `${STAMP_LABEL[kind]} stamped ${pragueHhmm(at)} (recorded offline, sent ${pragueHhmm(now)})` : "";
    return { movement: await this.get(id, companyId), outcome: "stamped", notice };
  }

  async refuse(id: string, companyId: string, userId: string, reason: string) {
    if (!reason.trim()) throw APIError.invalidArgument("A refusal reason is required");
    const m = await this.load(id, companyId);
    if (m.status === "Refused") throw APIError.failedPrecondition("Movement is already refused");
    if (m.impRelease) throw APIError.failedPrecondition("The cargo is already released — it can no longer be refused");
    const now = new Date();
    const by = await this.userName(userId);
    const refusalLog = `${hhmm(now)} · plate ${m.plate || "—"} · REFUSED: ${reason.trim()} · by ${by || "—"}`;
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      { status: "Refused", overridden: false, refusalLog },
      [{ kind: "refused", label: "Refused", at: now.toISOString(), by, detail: reason.trim() }],
      sql`${t.status} <> 'Refused' AND ${t.impRelease} IS NULL`,
    );
    if (!row) {
      const cur = await this.load(id, companyId);
      if (cur.impRelease) throw APIError.failedPrecondition("The cargo is already released — it can no longer be refused");
      throw APIError.failedPrecondition("Movement is already refused");
    }
    return this.get(id, companyId);
  }

  // "Ask for release": records that someone asked ops to clear the release gates. It changes
  // no gate by itself — the release still needs every gate OK (or a supervisor override).
  async requestRelease(id: string, companyId: string, userId: string) {
    const m = await this.load(id, companyId);
    if (m.impRelease) throw APIError.failedPrecondition("Movement is already released");
    const now = new Date();
    const by = await this.userName(userId);
    const pending = m.releaseGates.filter((g) => g.s !== "OK").map((g) => g.g).join(", ");
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      { updatedBy: by },
      [{ kind: "releaseRequested", label: "Release requested", at: now.toISOString(), by, detail: pending || "all gates OK" }],
      sql`${t.impRelease} IS NULL`,
    );
    if (!row) {
      await this.load(id, companyId);
      throw APIError.failedPrecondition("Movement is already released");
    }
    return this.get(id, companyId);
  }

  // "Ask for MRN number": records that someone asked for the customs MRN of this movement.
  async requestMrn(id: string, companyId: string, userId: string) {
    const m = await this.load(id, companyId);
    if (m.mrn.trim()) throw APIError.failedPrecondition("The MRN is already recorded");
    const now = new Date();
    const by = await this.userName(userId);
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      { updatedBy: by },
      [{ kind: "mrnRequested", label: "MRN requested", at: now.toISOString(), by, detail: m.customsMode }],
      sql`btrim(${t.mrn}) = ''`,
    );
    if (!row) {
      await this.load(id, companyId);
      throw APIError.failedPrecondition("The MRN is already recorded");
    }
    return this.get(id, companyId);
  }

  // Supervisor-only: arms the release box regardless of the gates, keeping who, when,
  // a snapshot of the gates at that moment and the mandatory reason.
  // OPEN DECISION: an override stays armed for exceptions opened later (documented behaviour,
  // confirm with the owner whether a new exception should disarm it).
  async override(id: string, companyId: string, userId: string, reason: string) {
    if (!reason.trim()) throw APIError.invalidArgument("An override reason is required");
    const m = await this.load(id, companyId);
    const now = new Date();
    const by = await this.userName(userId);
    const snapshot = m.releaseGates.map((x) => `${x.g}: ${x.s}`).join("; ");
    const overrideLog = `${stampText(now)} · OVERRIDE by ${by || "—"} · gates at moment of override: ${snapshot || "none"} · reason: ${reason.trim()}`;
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      { overridden: true, overrideLog, status: sql`CASE WHEN ${t.status} = 'Refused' THEN 'In Warehouse' ELSE ${t.status} END` },
      [{ kind: "override", label: "Supervisor override", at: now.toISOString(), by, detail: reason.trim() }],
    );
    if (!row) throw APIError.notFound("Gate movement not found");
    return this.get(id, companyId);
  }

  // Ticks one release-gate line OK, or sets it back to Pending. Any user may, and each change
  // is logged with who and when. Customs follows the customs status and is never ticked by
  // hand; nothing changes once the WH release is stamped. The write only lands on the gates
  // as they were read, so two people ticking at once cannot lose each other's change.
  async setReleaseGate(id: string, companyId: string, userId: string, gate: string, ok: boolean) {
    if (/^customs$/i.test(gate)) throw APIError.invalidArgument("The Customs line follows the customs status");
    if (gate.trim().toLowerCase() === PICKUP_PIN_GATE.toLowerCase()) {
      throw APIError.invalidArgument(`The ${PICKUP_PIN_GATE} line is set by the PIN check at the gate`);
    }
    if (gate.trim().toLowerCase() === EXCEPTION_GATE.toLowerCase()) {
      throw APIError.invalidArgument(`The ${EXCEPTION_GATE} line follows the exceptions — resolve the exception to clear it`);
    }
    const m = await this.load(id, companyId);
    if (m.impRelease) throw APIError.failedPrecondition("Movement is already released");
    const line = m.releaseGates.find((x) => x.g === gate);
    if (!line) throw APIError.notFound(`No release gate "${gate}" on this movement`);
    const s: GateReleaseLine["s"] = ok ? "OK" : "Pending";
    if (line.s === s) return this.get(id, companyId);
    const now = new Date();
    const by = await this.userName(userId);
    const releaseGates = m.releaseGates.map((x) => (x.g === gate ? { ...x, s } : x));
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      { releaseGates },
      [{ kind: "releaseGate", label: ok ? `${gate}: OK` : `${gate}: back to Pending`, at: now.toISOString(), by }],
      sql`${t.releaseGates} = ${JSON.stringify(m.releaseGates)}::jsonb AND ${t.impRelease} IS NULL`,
    );
    if (!row) throw APIError.aborted("The release gates changed meanwhile — reload and try again");
    return this.get(id, companyId);
  }

  // Logs a label print on the movement: the first one is "Label printed", every later one
  // "Label reprinted". One UPDATE that appends in SQL, so parallel prints each keep their
  // event and the first/reprint choice reads the log as it is at that moment.
  async labelPrinted(id: string, companyId: string, userId: string, copies: number) {
    if (!Number.isInteger(copies) || copies < 1 || copies > MAX_LABEL_COPIES) {
      throw APIError.invalidArgument(`Copies must be a whole number from 1 to ${MAX_LABEL_COPIES}`);
    }
    const at = new Date().toISOString();
    const by = await this.userName(userId);
    const detail = `${copies} label${copies === 1 ? "" : "s"}`;
    const event = (label: string): GateEvent => ({ kind: "labelPrinted", label, at, by, detail });
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      {},
      sql`CASE WHEN ${t.events} @> '[{"kind":"labelPrinted"}]'::jsonb THEN ${json([event("Label reprinted")])} ELSE ${json([event("Label printed")])} END`,
    );
    if (!row) throw APIError.notFound("Gate movement not found");
    return this.get(id, companyId);
  }

  // The clerk types what the driver says; the answer is only match / no match.
  // A try is taken before the PIN is checked (and given back on a match), so parallel wrong
  // guesses never get more than MAX_PIN_TRIES and only the try that locks it logs the lock.
  // A matching PIN holds the last try for a moment before giving it back, so a check that
  // finds no try free waits a little (PIN_BUSY_WAITS) before it calls the PIN locked.
  // Outbound cargo of a position linked to a shipment is checked against the shipment's pick-up
  // PIN instead (see verifyPickupPin); every other movement keeps its own gate PIN.
  async verifyPin(id: string, companyId: string, userId: string, pin: string) {
    const m = await this.load(id, companyId);
    if (isLinkedOutbound(m)) return this.verifyPickupPin(m, companyId, userId, pin);
    let taken = await gateMovementRepository.takePinTry(id, companyId, MAX_PIN_TRIES);
    for (let wait = 0; !taken; wait++) {
      const m = await this.load(id, companyId);
      if (!m.pinHash) return { result: "no_pin" as const, tries: m.pinTries };
      if (wait >= PIN_BUSY_WAITS) {
        if (m.pinTries >= MAX_PIN_TRIES) return { result: "locked" as const, tries: m.pinTries };
        throw APIError.unavailable("The PIN check is busy — try again");
      }
      await new Promise((r) => setTimeout(r, 30));
      taken = await gateMovementRepository.takePinTry(id, companyId, MAX_PIN_TRIES);
    }
    if (await verify(taken.pinHash, pin.trim())) {
      await gateMovementRepository.refundPinTry(id, companyId);
      return { result: "match" as const, tries: taken.pinTries - 1 };
    }
    if (taken.pinTries < MAX_PIN_TRIES) {
      await this.logPinMiss(id, companyId, userId, MAX_PIN_TRIES - taken.pinTries);
      return { result: "no_match" as const, tries: taken.pinTries };
    }
    await gateMovementRepository.conditionalUpdate(id, companyId, {}, [
      { kind: "pinLocked", label: "PIN locked after 3 failed attempts", at: new Date().toISOString(), by: await this.userName(userId) },
    ]);
    return { result: "locked" as const, tries: taken.pinTries };
  }

  // The driver's PIN against the pick-up PIN operations made in Shipments. Same try rules as the
  // gate PIN, but the tries belong to the PIN (the section), not to the gate row, so several gate
  // rows of one shipment still get three tries in all. A match sets the Pick-up PIN line OK, logged
  // with who and when — unless operations made a new PIN meanwhile.
  private async verifyPickupPin(m: GateMovementRow, companyId: string, userId: string, pin: string) {
    const shipmentId = m.shipmentId!;
    let taken = await warehouseSectionRepository.takePickupPinTry(shipmentId, companyId, MAX_PIN_TRIES);
    for (let wait = 0; !taken; wait++) {
      const p = readPickup((await warehouseSectionRepository.findPickup(shipmentId, companyId))?.data);
      if (!hasPickupPin(p)) return { result: "no_pin" as const, tries: p.pinTries };
      if (wait >= PIN_BUSY_WAITS) {
        if (p.pinTries >= MAX_PIN_TRIES) return { result: "locked" as const, tries: p.pinTries };
        throw APIError.unavailable("The PIN check is busy — try again");
      }
      await sleep(30);
      taken = await warehouseSectionRepository.takePickupPinTry(shipmentId, companyId, MAX_PIN_TRIES);
    }
    const now = new Date();
    const key = pickupPinKey();
    if (pickupPinMatches(taken, pin, key)) {
      await warehouseSectionRepository.refundPickupPinTry(shipmentId, companyId, taken.pinId);
      // A plain PIN stored before hashing is hashed now that it has been checked.
      if (!taken.pinHash) {
        await warehouseSectionRepository.hashLegacyPickupPin(shipmentId, companyId, taken.pinId, hashPickupPin(key, taken.pinId, taken.pin));
      }
      const by = await this.userName(userId);
      const outcome = await warehouseSectionRepository.withPickupLock(shipmentId, companyId, async (tx) => {
        const cur = readPickup((await warehouseSectionRepository.findPickup(shipmentId, companyId, tx))?.data);
        if (cur.pinId !== taken.pinId) return "renewed" as const;
        const row = await gateMovementRepository.conditionalUpdate(
          m.id,
          companyId,
          { releaseGates: setPickupLineSql({ g: PICKUP_PIN_GATE, s: "OK", note: `verified ${hhmm(now)} · by ${by || "—"}` }) },
          [{ kind: "pickupPinVerified", label: PICKUP_PIN_GATE, at: now.toISOString(), by }],
          // Still linked to the shipment whose PIN was checked (not relinked meanwhile).
          sql`${t.impRelease} IS NULL AND ${linkedOutboundCond} AND ${linkedToShipmentCond(shipmentId)}`,
          tx,
        );
        return row ? ("set" as const) : ("unchanged" as const);
      });
      if (outcome === "renewed") throw APIError.aborted("The pick-up PIN was renewed meanwhile — ask the driver for the new PIN");
      // Not written: already released (nothing left to set), or no longer linked outbound.
      if (outcome === "unchanged") {
        const cur = await this.load(m.id, companyId);
        if (!cur.impRelease && isLinkedOutbound(cur)) throw APIError.aborted("The movement changed meanwhile — reload and try again");
      }
      return { result: "match" as const, tries: taken.pinTries - 1 };
    }
    if (taken.pinTries < MAX_PIN_TRIES) {
      await this.logPinMiss(m.id, companyId, userId, MAX_PIN_TRIES - taken.pinTries);
      return { result: "no_match" as const, tries: taken.pinTries };
    }
    await gateMovementRepository.conditionalUpdate(m.id, companyId, {}, [
      {
        kind: "pinLocked",
        label: "Pick-up PIN locked after 3 failed attempts — operations must make a new PIN",
        at: now.toISOString(),
        by: await this.userName(userId),
      },
    ]);
    return { result: "locked" as const, tries: taken.pinTries };
  }

  // A wrong PIN is logged (never the PIN itself) with the tries left; the try that locks the PIN
  // logs the lock instead.
  private async logPinMiss(id: string, companyId: string, userId: string, left: number) {
    await gateMovementRepository.appendEvents(id, companyId, [
      { kind: "pinCheckFailed", label: `PIN check: no match — ${left} ${left === 1 ? "try" : "tries"} left`, at: new Date().toISOString(), by: await this.userName(userId) },
    ]);
  }

  // Operations make the pick-up PIN in Shipments: six digits from a secure random source. A new
  // one replaces the old only after the old one is locked at the gate (3 wrong tries); then the
  // tries start again and the Pick-up PIN line of the shipment's open gate rows goes back to
  // Pending, logged. The PIN itself is never logged.
  // The PIN is returned here, once; only its hash is stored.
  async generatePickupPin(shipmentId: string, companyId: string, userId: string) {
    if (!shipmentId.trim()) throw APIError.invalidArgument("A shipment is required");
    // Checked before it reaches SQL: Postgres answers a non-uuid in a uuid column with an error.
    if (!isUuid(shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    // A pick-up row is made only for a live shipment of this company.
    await assertShipmentExists(shipmentId);
    const at = new Date().toISOString();
    const by = await this.userName(userId);
    const pin = newPickupPin();
    const pinId = randomUUID();
    const res = await warehouseSectionRepository.setPickupPin(
      shipmentId,
      companyId,
      { pinHash: hashPickupPin(pickupPinKey(), pinId, pin), pinId, at, by },
      MAX_PIN_TRIES,
      (tx, kind) =>
        gateMovementRepository.resetPickupLineForShipment(
          tx,
          shipmentId,
          companyId,
          kind === "renewed" ? "new PIN generated — check again" : "waiting for the driver's PIN",
          kind === "renewed"
            ? { kind: "pickupPinRenewed", label: "New pick-up PIN generated in Shipments", at, by }
            : { kind: "pickupPinCreated", label: "Pick-up PIN generated in Shipments", at, by },
        ),
    );
    if (!res) {
      throw APIError.failedPrecondition("This shipment already has a pick-up PIN. A new one can be made only after it is locked at the gate (3 wrong tries).");
    }
    log.info("warehouse: pick-up PIN generated", { shipmentId, kind: res.kind, by });
    return { row: res.row, pin };
  }
}

export type StampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";

export const gateMovementService = new GateMovementService();
