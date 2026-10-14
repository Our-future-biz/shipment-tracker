import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { hash, verify } from "@node-rs/argon2";
import { auth, shipments } from "~encore/clients";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { containerRepository } from "../repositories/warehouseRecords.repository";
import type { GateChecklist, GateEvent, GateReleaseLine, GateSubPosition, GateSurvey, GateSurveyLine, GateTransportLeg, NewGateMovementRecord } from "../schemas/gateMovement.schema";
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
// line does not hold cargo release. A refusal disarms, a supervisor override arms.
export const RELEASE_STATUSES = ["Blocked", "Released"];

export function isArmed(m: Pick<GateMovementRow, "status" | "overridden" | "releaseGates" | "releaseStatus">): boolean {
  if (m.status === "Refused") return false;
  // A release picked by hand in the gate log wins over the gates.
  if (m.releaseStatus) return m.releaseStatus === "Released";
  if (m.overridden) return true;
  return !m.releaseGates.some((x) => x.s !== "OK" && !/empty return/i.test(x.g));
}

export function needsAttention(m: Pick<GateMovementRow, "visit" | "mrn" | "status" | "overridden" | "releaseGates" | "releaseStatus">): boolean {
  return (m.visit === "výdej" && !isArmed(m)) || !m.mrn || m.mrn === "—";
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

type ContainerRef = { id: string; number: string; equipment: string };

function toItem(m: GateMovementRow, containers: ContainerRef[] = []): GateMovementItem {
  const { pinHash, companyId: _companyId, deletedAt: _deletedAt, shipmentId: _shipmentId, ...rest } = m;
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
      releaseGates: data.releaseGates ?? defaultReleaseGates(handling, operationType, customsStatus),
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

    if (input.releaseStatus !== undefined && input.releaseStatus && !RELEASE_STATUSES.includes(input.releaseStatus)) {
      throw APIError.invalidArgument(`Release status must be ${RELEASE_STATUSES.join(" or ")}`);
    }
    // The UN number only exists for dangerous goods.
    if (input.dangerousGoods === false) patch.unNumber = "";
    // Customs status drives the Customs line of the release gate.
    if (input.customsStatus !== undefined && input.customsStatus !== m.customsStatus) {
      const gates = patch.releaseGates ?? m.releaseGates;
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

  // Saves the survey of one container (or the position when it has no container) and
  // records who surveyed it and when.
  async saveSurvey(id: string, companyId: string, userId: string, survey: GateSurveyInput) {
    const m = await this.load(id, companyId);
    const pieces = m.colli;
    const clamp = (n: number) => Math.max(0, Math.min(Math.floor(n || 0), pieces));
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
    const surveys = [...m.surveys.filter((x) => x.container !== survey.container).map(normalizeSurvey), record];
    await gateMovementRepository.update(id, companyId, { surveys, updatedBy: by });
    return this.get(id, companyId);
  }

  async remove(id: string, companyId: string) {
    const row = await gateMovementRepository.softDelete(id, companyId);
    if (!row) throw APIError.notFound("Gate movement not found");
  }

  // Gate stamps. Each one is final and files an event; documents are append-only, so an
  // export receipt keeps its draft (shown as superseded).
  async stamp(id: string, companyId: string, userId: string, kind: StampKind) {
    const m = await this.load(id, companyId);
    const now = new Date();
    const patch: Partial<NewGateMovementRecord> = {};
    let label: string;

    switch (kind) {
      case "gateIn":
        if (m.gateIn) throw APIError.failedPrecondition("Gate-in already stamped");
        patch.gateIn = now;
        if (m.status === "Expected") patch.status = "In Warehouse";
        label = "Gate-in";
        break;
      case "gateOut":
        if (m.gateOut) throw APIError.failedPrecondition("Gate-out already stamped");
        patch.gateOut = now;
        label = "Gate-out";
        break;
      case "impRelease":
        if (m.impRelease) throw APIError.failedPrecondition("WH release already stamped");
        if (!isArmed(m)) throw APIError.failedPrecondition("Release box NOT armed — gate must refuse. Use supervisor override only with reason.");
        patch.impRelease = now;
        patch.status = "Released";
        patch.gateOut = m.gateOut ?? now;
        label = "WH release";
        break;
      case "expDraft":
        if (m.expDraft) throw APIError.failedPrecondition("Draft receipt already created");
        patch.expDraft = now;
        patch.status = "In Warehouse";
        label = "WH draft receipt";
        break;
      case "expReceipt":
        if (!m.expDraft) throw APIError.failedPrecondition("Create the draft receipt first");
        if (m.expReceipt) throw APIError.failedPrecondition("WH receipt already confirmed");
        patch.expReceipt = now;
        patch.status = "In Warehouse";
        label = "WH receipt";
        break;
    }

    patch.events = [...m.events, { kind, label, at: now.toISOString(), by: await this.userName(userId) }];
    await gateMovementRepository.update(id, companyId, patch);
    await this.writeBackToShipment(m, kind, now);
    return this.get(id, companyId);
  }

  // The gate keeps the linked shipment's warehouse fields current: gate-in sets the received
  // date and the position reference (WCZ…), the cargo leaving (WH release, or gate-out of an
  // outgoing visit) sets the released date and the plate it left on. Positions created
  // without a shipment have nothing to update. The stamp stands even if this fails.
  private async writeBackToShipment(m: GateMovementRow, kind: StampKind, now: Date) {
    if (!m.shipmentId) return;
    const date = pragueDate(now);
    let data: { warehouseReceivedDate?: string; warehouseReference?: string; warehouseReleasedDate?: string; plateNumber?: string };
    if (kind === "gateIn") {
      data = { warehouseReceivedDate: date, ...(m.positionRef ? { warehouseReference: m.positionRef } : {}) };
    } else if (kind === "impRelease" ? !m.gateOut : kind === "gateOut" && m.visit === "výdej") {
      data = { warehouseReleasedDate: date, ...(m.plate ? { plateNumber: m.plate } : {}) };
    } else {
      return;
    }
    try {
      await shipments.shipmentUpdate({ shipmentId: m.shipmentId, ...data });
    } catch (err) {
      log.error(err, "warehouse: could not write the gate stamp back to the shipment", { movementId: m.id, shipmentId: m.shipmentId, kind });
    }
  }

  async refuse(id: string, companyId: string, userId: string, reason: string) {
    if (!reason.trim()) throw APIError.invalidArgument("A refusal reason is required");
    const m = await this.load(id, companyId);
    if (m.status === "Refused") throw APIError.failedPrecondition("Movement is already refused");
    const now = new Date();
    const by = await this.userName(userId);
    const refusalLog = `${hhmm(now)} · plate ${m.plate || "—"} · REFUSED: ${reason.trim()} · by ${by || "—"}`;
    await gateMovementRepository.update(id, companyId, {
      status: "Refused",
      overridden: false,
      refusalLog,
      events: [...m.events, { kind: "refused", label: "Refused", at: now.toISOString(), by, detail: reason.trim() }],
    });
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
    await gateMovementRepository.update(id, companyId, {
      events: [...m.events, { kind: "releaseRequested", label: "Release requested", at: now.toISOString(), by, detail: pending || "all gates OK" }],
      updatedBy: by,
    });
    return this.get(id, companyId);
  }

  // "Ask for MRN number": records that someone asked for the customs MRN of this movement.
  async requestMrn(id: string, companyId: string, userId: string) {
    const m = await this.load(id, companyId);
    if (m.mrn.trim()) throw APIError.failedPrecondition("The MRN is already recorded");
    const now = new Date();
    const by = await this.userName(userId);
    await gateMovementRepository.update(id, companyId, {
      events: [...m.events, { kind: "mrnRequested", label: "MRN requested", at: now.toISOString(), by, detail: m.customsMode }],
      updatedBy: by,
    });
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
    await gateMovementRepository.update(id, companyId, {
      overridden: true,
      overrideLog,
      ...(m.status === "Refused" ? { status: "In Warehouse" } : {}),
      events: [...m.events, { kind: "override", label: "Supervisor override", at: now.toISOString(), by, detail: reason.trim() }],
    });
    return this.get(id, companyId);
  }

  // The clerk types what the driver says; the answer is only match / no match.
  async verifyPin(id: string, companyId: string, userId: string, pin: string) {
    const m = await this.load(id, companyId);
    if (!m.pinHash) return { result: "no_pin" as const, tries: m.pinTries };
    if (m.pinTries >= MAX_PIN_TRIES) return { result: "locked" as const, tries: m.pinTries };
    if (await verify(m.pinHash, pin.trim())) return { result: "match" as const, tries: m.pinTries };

    const tries = m.pinTries + 1;
    const events =
      tries >= MAX_PIN_TRIES
        ? [...m.events, { kind: "pinLocked", label: "PIN locked after 3 failed attempts", at: new Date().toISOString(), by: await this.userName(userId) }]
        : m.events;
    await gateMovementRepository.update(id, companyId, { pinTries: tries, events });
    return { result: tries >= MAX_PIN_TRIES ? ("locked" as const) : ("no_match" as const), tries };
  }
}

export type StampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";

export const gateMovementService = new GateMovementService();
