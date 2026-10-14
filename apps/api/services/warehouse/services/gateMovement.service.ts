import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { hash, verify } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementRepository, hasStampSql, type GateMovementRow } from "../repositories/gateMovement.repository";
import { containerRepository } from "../repositories/warehouseRecords.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { gateMovementTable, type GateChecklist, type GateEvent, type GateMovementRecord, type GateReleaseLine, type GateSubPosition, type GateSurvey, type GateSurveyLine, type GateTransportLeg, type NewGateMovementRecord } from "../schemas/gateMovement.schema";
import type { NewShipmentOutboxRecord, ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { GateMovementInput, GateMovementItem, GatePickupInfo, GateSurveyInput } from "../interfaces/gate.interfaces";
import { CUSTOMS_CLEARED, CUSTOMS_STATUSES, customsLine } from "./customs";
import { deliverDue, shipmentUpdateState } from "./shipmentOutbox.service";
import { FOLLOW_LIST_LIMIT, FOLLOW_ON_GET_MS, FOLLOW_ON_LIST_MS, followCustoms } from "./shipmentFollow.service";
import { userName } from "./users";
import {
  isLinkedOutbound,
  linkedOutboundCond,
  linkedToShipmentCond,
  newPickupPin,
  PICKUP_PIN_GATE,
  pickupLineOkSql,
  pickupPinLine,
  pinMatches,
  readPickup,
  setPickupLineSql,
  type PickupData,
} from "./pickupPin";

export const MAX_PIN_TRIES = 3;

// Every check starts pending; the gate clicks each one to done, problem or n/a.
export const DEFAULT_CHECKLIST: GateChecklist = { ht: "a", photos: "a", measure: "a", vgm: "a", seal: "a", dg: "a" };

const isFcl = (operationType: string) => /^FCL|Container yard/.test(operationType);

export { CUSTOMS_CLEARED, CUSTOMS_MODES, CUSTOMS_STATUSES } from "./customs";
export const MAX_SUB_POSITIONS = 10;
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
  return pickupPin ? [...gates, pickupPinLine()] : gates;
}

function baseReleaseGates(handling: string, operationType: string, customsStatus: string): GateReleaseLine[] {
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
// arms. The old hand-set release status is no longer read (migration 0013 cleared it).
export function isArmed(m: Pick<GateMovementRow, "status" | "overridden" | "releaseGates">): boolean {
  if (m.status === "Refused") return false;
  if (m.overridden) return true;
  return !m.releaseGates.some((x) => x.s !== "OK" && !/empty return/i.test(x.g));
}

// Need attention = outgoing cargo (výdej) that cannot be released yet, or outgoing cargo
// still under customs (not cleared) with no MRN recorded. Incoming cargo and cleared cargo
// never need an MRN here, and cargo already released or gone out no longer needs attention.
export function needsAttention(
  m: Pick<GateMovementRow, "visit" | "mrn" | "customsStatus" | "status" | "overridden" | "releaseGates" | "impRelease" | "gateOut">,
): boolean {
  if (m.visit !== "výdej" || m.impRelease || m.gateOut) return false;
  const noMrn = !m.mrn.trim() || m.mrn === "—";
  return !isArmed(m) || (m.customsStatus !== CUSTOMS_CLEARED && noMrn);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

type ContainerRef = { id: string; number: string; equipment: string };

// What the gate shows of the shipment's pick-up: status, tries and the haulier rows to compare
// with the truck. Never the PIN itself, so the check at the gate is a real check.
const pickupInfo = (p: PickupData): GatePickupInfo => ({
  pinSet: !!p.pin,
  tries: p.pinTries,
  locked: !!p.pin && p.pinTries >= MAX_PIN_TRIES,
  pinCreatedAt: p.pinCreatedAt,
  pinCreatedBy: p.pinCreatedBy,
  rows: p.rows,
});

// `pickup` is the shipment's pick-up section; it is read only for linked outbound rows, whose
// PIN state then comes from it instead of the gate row's own PIN. `outbox` are the record's
// shipment updates not delivered yet.
function toItem(m: GateMovementRow, containers: ContainerRef[] = [], pickup?: PickupData, outbox: ShipmentOutboxRecord[] = []): GateMovementItem {
  const { pinHash, companyId: _companyId, deletedAt, releaseStatus: _releaseStatus, shipmentCheckedAt, ...rest } = m;
  const pick = isLinkedOutbound(m) ? pickupInfo(pickup ?? readPickup(null)) : null;
  return {
    ...rest,
    containers: containers.map((c) => ({ id: c.id, number: c.number, type: c.equipment })),
    transportLegs: normalizeLegs(m.transportLegs),
    surveys: m.surveys.map(normalizeSurvey),
    subPositions: m.subPositions.map(normalizeDrop),
    positionRef: m.positionRef ?? "",
    shipmentId: m.shipmentId ?? null,
    hasPin: pick ? pick.pinSet : !!pinHash,
    pinTries: pick ? pick.tries : m.pinTries,
    pinLocked: pick ? pick.locked : m.pinTries >= MAX_PIN_TRIES,
    pickup: pick,
    armed: isArmed(m),
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
// YYYY-MM-DD in the warehouse's local time, for the shipment's warehouse dates.
const pragueDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);

// Fields the general update never writes: status and release follow the stamps, the release
// gates, Refuse and the supervisor override, each logged through its own endpoint. Dropped
// even if a client sends them (the request type no longer has them).
const NOT_EDITABLE = ["status", "releaseGates", "releaseStatus", "overridden", "refusalLog", "overrideLog", "gateIn", "gateOut", "impRelease", "expDraft", "expReceipt", "events", "pinTries", "pinHash", "surveys"];

const t = gateMovementTable;
// Short waits (30 ms each) a PIN check makes for a try held by a parallel right PIN.
const PIN_BUSY_WAITS = 10;
const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
const sameTime = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();
// isArmed in SQL, so the release checks the gates as they are at the moment of the UPDATE
// (customs can change between loading the row and stamping it).
// Safety net: a linked outbound row is released only with its Pick-up PIN line OK, even if the
// line went missing from the gates (a supervisor override still clears it).
const armedSql = sql`${t.status} <> 'Refused' AND (${t.overridden} OR NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(${t.releaseGates}) x
  WHERE COALESCE(x->>'s', '') <> 'OK' AND COALESCE(x->>'g', '') !~* 'empty return'))
  AND (${t.overridden} OR NOT ${linkedOutboundCond} OR ${pickupLineOkSql})`;
const PICKUP_PIN_FROM_SHIPMENTS = "This movement uses the pick-up PIN from Shipments";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Outgoing cargo (výdej) leaves only through WH release, which stamps the gate-out too; a
// gate-out of its own would skip the release gates.
const OUT_NEEDS_RELEASE = "Outgoing cargo leaves through WH release (it stamps the gate-out too) — stamp WH release first";

// Why a stamp cannot be taken on the row as it is now; null when it can.
function stampBlocked(m: GateMovementRow, kind: StampKind): string | null {
  switch (kind) {
    case "gateIn":
      return m.gateIn ? "Gate-in already stamped" : null;
    case "gateOut":
      if (m.gateOut) return "Gate-out already stamped";
      return m.visit === "výdej" && !m.impRelease ? OUT_NEEDS_RELEASE : null;
    case "impRelease":
      if (m.impRelease) return "WH release already stamped";
      return isArmed(m) ? null : "Release box NOT armed — gate must refuse. Use supervisor override only with reason.";
    case "expDraft":
      return m.expDraft ? "Draft receipt already created" : null;
    case "expReceipt":
      if (!m.expDraft) return "Create the draft receipt first";
      return m.expReceipt ? "WH receipt already confirmed" : null;
  }
}

// A record as stored now (after a change made while it was being read), keeping its task link.
const withStored = (m: GateMovementRow, stored?: GateMovementRecord): GateMovementRow => (stored ? { ...m, ...stored } : m);

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

class GateMovementService {
  // The Gate Log. `archived` lists archived records only. `follow` reads the customs status of
  // a limited number of linked records from their shipments first (the list endpoint does).
  async list(companyId: string, opts: { archived?: boolean; follow?: boolean } = {}) {
    if (!opts.archived) await this.ensurePickupLine(companyId);
    let movements = opts.archived ? await gateMovementRepository.listArchived(companyId) : await gateMovementRepository.listAll(companyId);
    if (opts.follow && !opts.archived) {
      const changed = await followCustoms(movements, companyId, { maxAgeMs: FOLLOW_ON_LIST_MS, limit: FOLLOW_LIST_LIMIT });
      movements = movements.map((m) => withStored(m, changed.get(m.id)));
    }
    const ids = movements.map((m) => m.id);
    const containers = await containerRepository.listForMovements(ids, companyId);
    const outbox = await shipmentOutboxRepository.openForMovements(ids, companyId);
    const linked = [...new Set(movements.filter(isLinkedOutbound).map((m) => m.shipmentId!))];
    const sections = await warehouseSectionRepository.findPickupForShipments(linked, companyId);
    const pickupOf = (shipmentId: string | null) => readPickup(sections.find((x) => x.shipmentId === shipmentId)?.data);
    return movements.map((m) =>
      toItem(
        m,
        containers.filter((c) => c.movementId === m.id),
        isLinkedOutbound(m) ? pickupOf(m.shipmentId) : undefined,
        outbox.filter((o) => o.movementId === m.id),
      ),
    );
  }

  // Linked outbound rows made before the Pick-up PIN line existed get it on read (no migration).
  // Rows that stopped being linked outbound other than through update() (the task was deleted
  // or unlinked elsewhere) lose it on read, so they are not stuck on a line nothing can tick.
  private async ensurePickupLine(companyId: string, id?: string) {
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

  // One record, live or archived. `follow` (the endpoint, "Refresh") first reads the linked
  // shipment's customs status when it was not read in the last half minute (`force`: always).
  async get(id: string, companyId: string, opts: { follow?: boolean; force?: boolean } = {}) {
    await this.ensurePickupLine(companyId, id);
    let m = await gateMovementRepository.findById(id, companyId);
    if (m) {
      if (opts.follow) {
        const changed = await followCustoms([m], companyId, { maxAgeMs: FOLLOW_ON_GET_MS, limit: 1, force: opts.force });
        m = withStored(m, changed.get(m.id));
      }
    } else {
      m = await gateMovementRepository.findByIdAny(id, companyId);
      if (!m) throw APIError.notFound("Gate movement not found");
    }
    const containers = await containerRepository.listForMovements([m.id], companyId);
    const pickup = isLinkedOutbound(m) ? readPickup((await warehouseSectionRepository.findPickup(m.shipmentId!, companyId))?.data) : undefined;
    const outbox = await shipmentOutboxRepository.openForMovements([m.id], companyId);
    return toItem(m, containers, pickup, outbox);
  }

  // Every action reads the row through here, so it always sees the Pick-up PIN line when the
  // row is linked outbound.
  private async load(id: string, companyId: string) {
    await this.ensurePickupLine(companyId, id);
    const m = await gateMovementRepository.findById(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    return m;
  }

  // Display name of the acting user for the gate log. Users live in the auth service.
  private async userName(userId: string): Promise<string> {
    return userName(userId);
  }

  private async fields(input: GateMovementInput, companyId: string): Promise<Partial<NewGateMovementRecord>> {
    const { pin, warehouseTaskId, transportLegs, subPositions, ...rest } = input;
    const out: Partial<NewGateMovementRecord> = { ...rest };
    for (const key of NOT_EDITABLE) delete (out as Record<string, unknown>)[key];
    if (transportLegs !== undefined) out.transportLegs = normalizeLegs(transportLegs);
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
    const row = await gateMovementRepository.create(await this.buildRecord(companyId, userId, input));
    return this.get(row.id, companyId);
  }

  async update(id: string, companyId: string, userId: string, input: GateMovementInput, role = "user") {
    const m = await this.load(id, companyId);
    const patch = await this.fields(input, companyId);

    // Direction is held twice — handling (Import/Export) and the gate visit (výdej/příjem) the
    // gate rules follow — so they change together, and only until the first gate stamp.
    const handlingChanged = input.handling !== undefined && input.handling !== m.handling;
    const visitChanged = input.visit !== undefined && input.visit !== m.visit;
    if (handlingChanged || visitChanged) {
      if (m.gateIn || m.gateOut || m.impRelease || m.expDraft || m.expReceipt) {
        throw APIError.failedPrecondition("Direction cannot change once a gate stamp is recorded");
      }
      if (handlingChanged && input.visit === undefined) patch.visit = input.handling === "Import" ? "výdej" : "příjem";
      if (visitChanged && input.handling === undefined) patch.handling = input.visit === "výdej" ? "Import" : "Export";
    }

    // The UN number only exists for dangerous goods.
    if (input.dangerousGoods === false) patch.unNumber = "";
    // Customs status drives the Customs line of the release gate.
    if (input.customsStatus !== undefined && input.customsStatus !== m.customsStatus) {
      const gates = m.releaseGates;
      patch.releaseGates = gates.some((g) => g.g === "Customs")
        ? gates.map((g) => (g.g === "Customs" ? customsLine(input.customsStatus!) : g))
        : [...gates, customsLine(input.customsStatus)];
    }
    // The grid's carrier / driver / plate follow the leg the cargo moves on at this gate.
    if (patch.transportLegs) {
      const leg = patch.transportLegs.find((l) => l.leg === ((input.visit ?? m.visit) === "výdej" ? "OUT" : "IN"))!;
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
    // A plate entered (or corrected) after the cargo of a linked record was released goes to the
    // shipment too, through the outbox like the release itself.
    const plateLater = !!m.shipmentId && !!m.impRelease && patch.plate !== undefined && !!patch.plate.trim() && patch.plate !== m.plate;
    await db.transaction(async (tx) => {
      await gateMovementRepository.update(id, companyId, patch, tx);
      if (plateLater) {
        await shipmentOutboxRepository.enqueue(tx, [
          outboxRow(m, "plate", m.impRelease ? "impRelease" : "gateOut", { plateNumber: patch.plate!.trim() }, userId, role),
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

  // Saves the survey of one container (or the position when it has no container) for one
  // pass — receipt or release — and records who surveyed it and when. Damaged / lost are
  // capped to the pieces on the movement only when those are known (pieces > 0).
  async saveSurvey(id: string, companyId: string, userId: string, survey: GateSurveyInput) {
    if (!SURVEY_PHASES.includes(survey.phase)) throw APIError.invalidArgument(`Survey phase must be one of: ${SURVEY_PHASES.join(", ")}`);
    const m = await this.load(id, companyId);
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
      surveyedAt: new Date().toISOString(),
      surveyedBy: by,
    };
    // One statement replaces this container's survey of this pass, so two tablets saving
    // different containers (or passes) at once do not overwrite each other.
    const key = surveyPhaseKey(survey.phase);
    const kept = sql`COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(${t.surveys}) e
      WHERE NOT (e->>'container' = ${survey.container}
        AND (CASE WHEN e->>'phase' ~ '^Release' THEN 'release' ELSE 'receipt' END) = ${key})), '[]'::jsonb)`;
    const row = await gateMovementRepository.conditionalUpdate(id, companyId, { surveys: sql`${kept} || ${json([record])}`, updatedBy: by });
    if (!row) throw APIError.notFound("Gate movement not found");
    return this.get(id, companyId);
  }

  // Any user may delete a record the gate never stamped (it moves to the archive, logged). A
  // stamped record is evidence: only a manager archives it, with a reason (gateAdminService).
  async remove(id: string, companyId: string, userId: string) {
    const by = await this.userName(userId);
    const row = await gateMovementRepository.archive(
      id,
      companyId,
      by,
      "",
      { kind: "deleted", label: "Deleted", at: new Date().toISOString(), by },
      sql`NOT ${hasStampSql}`,
    );
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
  async stamp(id: string, companyId: string, userId: string, kind: StampKind, role = "user") {
    const m = await this.load(id, companyId);
    const blocked = stampBlocked(m, kind);
    if (blocked) throw APIError.failedPrecondition(blocked);
    const now = new Date();
    const by = await this.userName(userId);
    const evt = (k: string, label: string): GateEvent => ({ kind: k, label, at: now.toISOString(), by });
    const toWarehouse = sql`CASE WHEN ${t.status} = 'Expected' THEN 'In Warehouse' ELSE ${t.status} END`;
    // Export arrival: gate-in too when it is still empty, logged before the stamp itself.
    const arrival = (own: GateEvent) => ({
      set: { gateIn: sql`COALESCE(${t.gateIn}, ${now.toISOString()}::timestamptz)` },
      events: sql`CASE WHEN ${t.gateIn} IS NULL THEN ${json([evt("gateIn", "Gate-in"), own])} ELSE ${json([own])} END`,
    });

    const { row, owed } = await db.transaction(async (tx) => {
      let row: GateMovementRecord | null = null;
      switch (kind) {
        case "gateIn":
          row = await gateMovementRepository.conditionalUpdate(id, companyId, { gateIn: now, status: toWarehouse }, [evt(kind, "Gate-in")], sql`${t.gateIn} IS NULL`, tx);
          break;
        case "gateOut":
          row = await gateMovementRepository.conditionalUpdate(
            id,
            companyId,
            { gateOut: now },
            [evt(kind, "Gate-out")],
            sql`${t.gateOut} IS NULL AND (${t.visit} <> 'výdej' OR ${t.impRelease} IS NOT NULL)`,
            tx,
          );
          break;
        case "impRelease":
          row = await gateMovementRepository.conditionalUpdate(
            id,
            companyId,
            { impRelease: now, status: "Released", gateOut: sql`COALESCE(${t.gateOut}, ${now.toISOString()}::timestamptz)` },
            [evt(kind, "WH release")],
            sql`${t.impRelease} IS NULL AND ${armedSql}`,
            tx,
          );
          break;
        case "expDraft": {
          const a = arrival(evt(kind, "WH draft receipt"));
          row = await gateMovementRepository.conditionalUpdate(id, companyId, { ...a.set, expDraft: now, status: toWarehouse }, a.events, sql`${t.expDraft} IS NULL`, tx);
          break;
        }
        case "expReceipt": {
          const a = arrival(evt(kind, "WH receipt"));
          row = await gateMovementRepository.conditionalUpdate(
            id,
            companyId,
            { ...a.set, expReceipt: now, status: toWarehouse },
            a.events,
            sql`${t.expReceipt} IS NULL AND ${t.expDraft} IS NOT NULL`,
            tx,
          );
          break;
        }
      }
      if (!row) return { row, owed: [] };
      // Write back only what this very update stamped. Received means inbound cargo arriving: an
      // outbound (výdej) gate-in is the pickup truck, not a receipt. (A výdej gate-out of its own
      // happens only on an already released row whose release left the gate-out empty.)
      // Positions without a shipment have nothing to update. (Export gate-out writes nothing back
      // yet — an open decision.)
      const owed: NewShipmentOutboxRecord[] = [];
      if (m.shipmentId) {
        const date = pragueDate(now);
        if (sameTime(row.gateIn, now) && m.visit !== "výdej") {
          owed.push(outboxRow(m, "received", "gateIn", { warehouseReceivedDate: date, ...(m.positionRef ? { warehouseReference: m.positionRef } : {}) }, userId, role));
        }
        if ((kind === "impRelease" && sameTime(row.gateOut, now)) || (kind === "gateOut" && row.visit === "výdej")) {
          owed.push(outboxRow(m, "released", kind, { warehouseReleasedDate: date, ...(row.plate ? { plateNumber: row.plate } : {}) }, userId, role));
        }
      }
      await shipmentOutboxRepository.enqueue(tx, owed);
      return { row, owed };
    });
    if (!row) {
      // Someone else got there first (or the row is gone): report what the row says now.
      const cur = await this.load(id, companyId);
      throw APIError.failedPrecondition(stampBlocked(cur, kind) ?? `${kind} could not be stamped — reload and try again`);
    }
    if (owed.length) await deliverDue(id);
    return this.get(id, companyId);
  }

  async refuse(id: string, companyId: string, userId: string, reason: string) {
    if (!reason.trim()) throw APIError.invalidArgument("A refusal reason is required");
    const m = await this.load(id, companyId);
    if (m.status === "Refused") throw APIError.failedPrecondition("Movement is already refused");
    const now = new Date();
    const by = await this.userName(userId);
    const refusalLog = `${hhmm(now)} · plate ${m.plate || "—"} · REFUSED: ${reason.trim()} · by ${by || "—"}`;
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      { status: "Refused", overridden: false, refusalLog },
      [{ kind: "refused", label: "Refused", at: now.toISOString(), by, detail: reason.trim() }],
      sql`${t.status} <> 'Refused'`,
    );
    if (!row) {
      await this.load(id, companyId);
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
    if (taken.pinTries < MAX_PIN_TRIES) return { result: "no_match" as const, tries: taken.pinTries };
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
      if (!p.pin) return { result: "no_pin" as const, tries: p.pinTries };
      if (wait >= PIN_BUSY_WAITS) {
        if (p.pinTries >= MAX_PIN_TRIES) return { result: "locked" as const, tries: p.pinTries };
        throw APIError.unavailable("The PIN check is busy — try again");
      }
      await sleep(30);
      taken = await warehouseSectionRepository.takePickupPinTry(shipmentId, companyId, MAX_PIN_TRIES);
    }
    const now = new Date();
    if (pinMatches(taken.pin, pin)) {
      await warehouseSectionRepository.refundPickupPinTry(shipmentId, companyId, taken.pinId);
      const by = await this.userName(userId);
      const outcome = await warehouseSectionRepository.withPickupLock(shipmentId, companyId, async (tx) => {
        const cur = readPickup((await warehouseSectionRepository.findPickup(shipmentId, companyId, tx))?.data);
        if (cur.pinId !== taken.pinId || cur.pin !== taken.pin.trim()) return "renewed" as const;
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
    if (taken.pinTries < MAX_PIN_TRIES) return { result: "no_match" as const, tries: taken.pinTries };
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

  // Operations make the pick-up PIN in Shipments: six digits from a secure random source. A new
  // one replaces the old only after the old one is locked at the gate (3 wrong tries); then the
  // tries start again and the Pick-up PIN line of the shipment's open gate rows goes back to
  // Pending, logged. The PIN itself is never logged.
  async generatePickupPin(shipmentId: string, companyId: string, userId: string) {
    if (!shipmentId.trim()) throw APIError.invalidArgument("A shipment is required");
    const at = new Date().toISOString();
    const by = await this.userName(userId);
    const res = await warehouseSectionRepository.setPickupPin(
      shipmentId,
      companyId,
      { pin: newPickupPin(), pinId: randomUUID(), at, by },
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
    return res.row;
  }
}

export type StampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";

export const gateMovementService = new GateMovementService();
