import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { hash, verify } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { auth, shipments } from "~encore/clients";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { containerRepository } from "../repositories/warehouseRecords.repository";
import { gateMovementTable, type GateChecklist, type GateEvent, type GateReleaseLine, type GateSubPosition, type GateSurvey, type GateSurveyLine, type GateTransportLeg, type NewGateMovementRecord } from "../schemas/gateMovement.schema";
import type { GateMovementInput, GateMovementItem, GateSurveyInput } from "../interfaces/gate.interfaces";

export const MAX_PIN_TRIES = 3;

// Every check starts pending; the gate clicks each one to done, problem or n/a.
const DEFAULT_CHECKLIST: GateChecklist = { ht: "a", photos: "a", measure: "a", vgm: "a", seal: "a", dg: "a" };

const isFcl = (operationType: string) => /^FCL|Container yard/.test(operationType);

// Customs statuses shared with the Shipments module; only the last one releases cargo.
export const CUSTOMS_STATUSES = [
  "Waiting For Commercial Paperwork",
  "Paperwork Verification Pending",
  "Paperwork Verified",
  "Under Customs Clearance",
  "Customs Cleared/Released",
];
export const CUSTOMS_CLEARED = "Customs Cleared/Released";
export const MAX_SUB_POSITIONS = 10;
const LEGS: GateTransportLeg["leg"][] = ["IN", "OUT", "CFS"];

const customsLine = (customsStatus: string): GateReleaseLine =>
  customsStatus === CUSTOMS_CLEARED
    ? { g: "Customs", s: "OK", note: "released" }
    : { g: "Customs", s: "Pending", note: customsStatus || "customs status not set" };

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
export function defaultReleaseGates(handling: string, operationType: string, customsStatus: string): GateReleaseLine[] {
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

function toItem(m: GateMovementRow, containers: ContainerRef[] = []): GateMovementItem {
  const { pinHash, companyId: _companyId, deletedAt: _deletedAt, shipmentId: _shipmentId, releaseStatus: _releaseStatus, ...rest } = m;
  return {
    ...rest,
    containers: containers.map((c) => ({ id: c.id, number: c.number, type: c.equipment })),
    transportLegs: normalizeLegs(m.transportLegs),
    surveys: m.surveys.map(normalizeSurvey),
    subPositions: m.subPositions.map(normalizeDrop),
    positionRef: m.positionRef ?? "",
    hasPin: !!pinHash,
    pinLocked: m.pinTries >= MAX_PIN_TRIES,
    armed: isArmed(m),
    needsAttention: needsAttention(m),
    gateIn: iso(m.gateIn),
    gateOut: iso(m.gateOut),
    impRelease: iso(m.impRelease),
    expDraft: iso(m.expDraft),
    expReceipt: iso(m.expReceipt),
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
const armedSql = sql`${t.status} <> 'Refused' AND (${t.overridden} OR NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(${t.releaseGates}) x
  WHERE COALESCE(x->>'s', '') <> 'OK' AND COALESCE(x->>'g', '') !~* 'empty return'))`;
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

class GateMovementService {
  async list(companyId: string) {
    await this.ensureForTasks(companyId);
    const movements = await gateMovementRepository.listAll(companyId);
    const containers = await containerRepository.listForMovements(movements.map((m) => m.id), companyId);
    return movements.map((m) => toItem(m, containers.filter((c) => c.movementId === m.id)));
  }

  // Every warehouse task shows up in the Gate Log: tasks without a gate row get one,
  // pre-filled from their shipment. Import cargo leaves through the gate (výdej),
  // export cargo arrives (příjem).
  async ensureForTasks(companyId: string) {
    const tasks = await gateMovementRepository.tasksWithoutMovement(companyId);
    if (!tasks.length) return;
    const now = new Date().toISOString();
    const rows = await Promise.all(
      tasks.map(async (task): Promise<NewGateMovementRecord> => {
        const s = await shipments
          .shipmentGet({ shipmentId: task.shipmentId! })
          .then((r) => r.shipment)
          .catch(() => null);
        const handling = s && /export/i.test(s.tradeDirection) ? "Export" : "Import";
        const operationType = "LCL consolidation";
        const customsMode = "SCP";
        const customsStatus = s && CUSTOMS_STATUSES.includes(s.customsStatus) ? s.customsStatus : CUSTOMS_STATUSES[0]!;
        return {
          companyId,
          gateRef: task.taskId,
          warehouseTaskId: task.id,
          visit: handling === "Import" ? "výdej" : "příjem",
          handling,
          operationType,
          customsMode,
          customer: s?.customer ?? "",
          customerRef: s?.customerReference ?? "",
          customerContact: s?.customerPic ?? "",
          shipmentOwner: s?.personInCharge ?? "",
          colli: parseInt(s?.pcs ?? "", 10) || 0,
          packing: s?.typeOfPackages ?? "",
          weightKg: s?.totalWeightTons ? Math.round(parseFloat(s.totalWeightTons) * 1000) || 0 : 0,
          measureCbm: s?.totalVolumeCbm ? parseFloat(s.totalVolumeCbm) || 0 : 0,
          freightMode: s?.freightMode ?? "",
          loadType: s?.loadType ?? "",
          commodity: s?.cargoDescription ?? "",
          jobNumber: s?.jobNumber ?? "",
          pol: s?.pol ?? "",
          pod: s?.pod ?? "",
          etd: s?.estimatedDeparture ?? "",
          eta: s?.estimatedArrival ?? "",
          vessel: s?.vessel ?? "",
          voyage: s?.voyage ?? "",
          containerNumber: s?.containerNumber ?? "",
          sealNumber: s?.sealNumber ?? "",
          bookingNumber: s?.bookingNumber ?? "",
          hblNumber: s?.houseBolNumber ?? "",
          mblNumber: s?.masterBolNumber ?? "",
          customsStatus,
          transportLegs: normalizeLegs([]),
          checklist: DEFAULT_CHECKLIST,
          releaseGates: defaultReleaseGates(handling, operationType, customsStatus),
          events: [{ kind: "created", label: `Created from warehouse task ${task.taskId}`, at: now, by: "" }],
        };
      }),
    );
    await gateMovementRepository.createForTasks(companyId, rows);
  }

  async removeForTask(taskId: string, companyId: string) {
    await gateMovementRepository.removeUntouchedForTask(taskId, companyId);
  }

  async get(id: string, companyId: string) {
    const m = await this.load(id, companyId);
    const containers = await containerRepository.listForMovements([m.id], companyId);
    return toItem(m, containers);
  }

  private async load(id: string, companyId: string) {
    const m = await gateMovementRepository.findById(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    return m;
  }

  // Display name of the acting user for the gate log. Users live in the auth service.
  private async userName(userId: string): Promise<string> {
    try {
      const { users } = await auth.usersList();
      const me = users.find((u) => u.id === userId);
      return me?.displayName || me?.email || "";
    } catch {
      return "";
    }
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

  async create(companyId: string, userId: string, input: GateMovementInput & { walkIn?: boolean }) {
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

    const events: GateEvent[] = [
      { kind: walkIn ? "walkIn" : "created", label: walkIn ? "Walk-in at the gate — unlinked, ops notified" : "Movement created", at: now.toISOString(), by: await this.userName(userId) },
    ];
    const row = await gateMovementRepository.create({
      ...data,
      companyId,
      gateRef,
      handling,
      operationType,
      customsMode,
      customsStatus,
      transportLegs: data.transportLegs ?? normalizeLegs([]),
      updatedBy: await this.userName(userId),
      checklist: { ...DEFAULT_CHECKLIST, ...(data.checklist ?? {}) },
      releaseGates: defaultReleaseGates(handling, operationType, customsStatus),
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
    });
    return this.get(row.id, companyId);
  }

  async update(id: string, companyId: string, userId: string, input: GateMovementInput) {
    const m = await this.load(id, companyId);
    const patch = await this.fields(input, companyId);

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
    patch.updatedBy = await this.userName(userId);
    await gateMovementRepository.update(id, companyId, patch);
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

  async remove(id: string, companyId: string) {
    const row = await gateMovementRepository.softDelete(id, companyId);
    if (!row) throw APIError.notFound("Gate movement not found");
  }

  // Gate stamps. Each one is final and files an event; documents are append-only, so an
  // export receipt keeps its draft (shown as superseded). Each stamp is one conditional
  // UPDATE (the column is set only while still empty), so of two clerks stamping at once
  // exactly one wins and the shipment is written back once.
  // The first export arrival stamp (draft receipt or receipt) is the receipt at the gate:
  // it also stamps gate-in when that is still empty, so the shipment gets its received date.
  async stamp(id: string, companyId: string, userId: string, kind: StampKind) {
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

    let row;
    switch (kind) {
      case "gateIn":
        row = await gateMovementRepository.conditionalUpdate(id, companyId, { gateIn: now, status: toWarehouse }, [evt(kind, "Gate-in")], sql`${t.gateIn} IS NULL`);
        break;
      case "gateOut":
        row = await gateMovementRepository.conditionalUpdate(
          id,
          companyId,
          { gateOut: now },
          [evt(kind, "Gate-out")],
          sql`${t.gateOut} IS NULL AND (${t.visit} <> 'výdej' OR ${t.impRelease} IS NOT NULL)`,
        );
        break;
      case "impRelease":
        row = await gateMovementRepository.conditionalUpdate(
          id,
          companyId,
          { impRelease: now, status: "Released", gateOut: sql`COALESCE(${t.gateOut}, ${now.toISOString()}::timestamptz)` },
          [evt(kind, "WH release")],
          sql`${t.impRelease} IS NULL AND ${armedSql}`,
        );
        break;
      case "expDraft": {
        const a = arrival(evt(kind, "WH draft receipt"));
        row = await gateMovementRepository.conditionalUpdate(id, companyId, { ...a.set, expDraft: now, status: toWarehouse }, a.events, sql`${t.expDraft} IS NULL`);
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
        );
        break;
      }
    }
    if (!row) {
      // Someone else got there first (or the row is gone): report what the row says now.
      const cur = await this.load(id, companyId);
      throw APIError.failedPrecondition(stampBlocked(cur, kind) ?? `${kind} could not be stamped — reload and try again`);
    }

    // Write back only what this very update stamped. (A výdej gate-out of its own happens only
    // on an already released row whose release left the gate-out empty.)
    if (sameTime(row.gateIn, now)) await this.writeBackToShipment(m, "received", now);
    if ((kind === "impRelease" && sameTime(row.gateOut, now)) || (kind === "gateOut" && row.visit === "výdej")) {
      await this.writeBackToShipment(m, "released", now);
    }
    return this.get(id, companyId);
  }

  // The gate keeps the linked shipment's warehouse fields current: gate-in sets the received
  // date and the position reference (WCZ…), the cargo leaving (WH release, or gate-out of an
  // outgoing visit) sets the released date and the plate it left on. Positions created
  // without a shipment have nothing to update. The stamp stands even if this fails.
  // (Export gate-out writes nothing back yet — an open decision.)
  private async writeBackToShipment(m: GateMovementRow, what: "received" | "released", now: Date) {
    if (!m.shipmentId) return;
    const date = pragueDate(now);
    const data =
      what === "received"
        ? { warehouseReceivedDate: date, ...(m.positionRef ? { warehouseReference: m.positionRef } : {}) }
        : { warehouseReleasedDate: date, ...(m.plate ? { plateNumber: m.plate } : {}) };
    try {
      await shipments.shipmentUpdate({ shipmentId: m.shipmentId, ...data });
    } catch (err) {
      log.error(err, "warehouse: could not write the gate stamp back to the shipment", { movementId: m.id, shipmentId: m.shipmentId, what });
    }
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

  // The clerk types what the driver says; the answer is only match / no match.
  // A try is taken before the PIN is checked (and given back on a match), so parallel wrong
  // guesses never get more than MAX_PIN_TRIES and only the try that locks it logs the lock.
  // A matching PIN holds the last try for a moment before giving it back, so a check that
  // finds no try free waits a little (PIN_BUSY_WAITS) before it calls the PIN locked.
  async verifyPin(id: string, companyId: string, userId: string, pin: string) {
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
}

export type StampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";

export const gateMovementService = new GateMovementService();
