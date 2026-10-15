import { APIError } from "encore.dev/api";
import { isIsoDate, pragueDate, storageClock, wmOf } from "./storage";
import {
  bondedEntryRepository,
  stockGateReader,
  stockLineRepository,
  stockMovementRepository,
  zoneRepository,
  type PositionLink,
} from "../repositories/warehouseStock.repository";
import { customsClock, type CustomsRegime } from "./warehouseStockCustoms";
import { previewStockSync, syncStockForMovements } from "./warehouseStockSync";
import { userName } from "./users";
import type {
  warehouseBondedEntryTable,
  warehouseStockLineTable,
  warehouseStockMovementTable,
  warehouseZoneTable,
} from "../schemas/warehouseStock.schema";
import type {
  WarehouseBondedEntryInput,
  WarehouseBondedEntryItem,
  WarehouseStockLineInput,
  WarehouseStockLineItem,
  WarehouseStockMovementInput,
  WarehouseStockMovementItem,
  WarehouseStockSyncResult,
  WarehouseZoneInput,
  WarehouseZoneItem,
} from "../interfaces/stock.interfaces";

type StockLineRow = typeof warehouseStockLineTable.$inferSelect;
type ZoneRow = typeof warehouseZoneTable.$inferSelect;
type MovementRow = typeof warehouseStockMovementTable.$inferSelect;
type BondedRow = typeof warehouseBondedEntryTable.$inferSelect;

export const STOCK_STATUSES = ["Available", "Allocated", "On hold", "Picked"];
/** What a user may set on an automatic line (Picked / Voided follow the gate). */
export const AUTO_LINE_STATUSES = ["Available", "Allocated", "On hold"];
/** Fields of an automatic line people may change; the rest follows the gate record. */
export const AUTO_LINE_EDITABLE = ["location", "status", "consol", "marks"] as const;
export const STOCK_CUSTOMS = ["Free circulation", "T1 bonded", "Temporary storage", "Customs warehouse", "Export cleared"];
const CLOSED_STATUSES = ["Picked", "Voided"];
const FOLLOWS_GATE = "follows the gate record — change it on the position (gate job)";
export const MOVEMENT_TYPES = ["Receipt", "Put-away", "Transfer", "Pick", "Load", "Adjustment", "Rework"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const stamps = (r: { createdAt: Date; updatedAt: Date }) => ({ createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const notFound = (what: string) => APIError.notFound(`${what} not found`);

const requireText = (value: string | undefined, label: string) => {
  if (value !== undefined && !value.trim()) throw APIError.invalidArgument(`${label} is required`);
};
const checkDate = (value: string | undefined, label: string) => {
  if (value && !DATE.test(value)) throw APIError.invalidArgument(`${label} must be a date (YYYY-MM-DD)`);
};
const checkOneOf = (value: string | undefined, allowed: string[], label: string) => {
  if (value !== undefined && !allowed.includes(value)) throw APIError.invalidArgument(`${label} must be one of: ${allowed.join(", ")}`);
};
const checkNotNegative = (value: number | undefined, label: string) => {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw APIError.invalidArgument(`${label} cannot be negative`);
};

// ---------- Stock on hand ----------

// Free time follows the warehouse's one storage calculation (storage.ts): the receipt day is
// day 1, calendar days in Prague time, CZK 22 per W/M per day (at least CZK 120).
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** The customs regime of a line: the gate's for automatic lines, from the Customs column for manual ones. */
const lineRegime = (r: Pick<StockLineRow, "customs"> & { customsRegime?: string | null }): CustomsRegime =>
  (r.customsRegime as CustomsRegime) ||
  (r.customs === "T1 bonded" ? "Transit T1" : r.customs === "Temporary storage" ? "Temporary storage" : r.customs === "Customs warehouse" ? "Customs warehouse" : "");

export const isClosedLine = (r: Pick<StockLineRow, "status"> & { closedAt?: Date | null }) => CLOSED_STATUSES.includes(r.status) || !!r.closedAt;

type StockLineIn = StockLineRow & Partial<PositionLink>;

export function stockLineItem(r: StockLineIn, now = new Date()): WarehouseStockLineItem {
  const {
    companyId: _c,
    deletedAt: _d,
    createdAt: _ca,
    updatedAt: _ua,
    positionRef,
    gateRef: _g,
    jobNumber,
    positionArchived,
    closedAt,
    receivedInstant,
    movementId,
    taskId,
    ...fields
  } = r;
  const closed = isClosedLine(r);
  const today = pragueDate(now);
  // A line that left stops its clock on the day it left.
  const stop = closed && closedAt ? pragueDate(closedAt) : null;
  const clock = storageClock({ start: r.receivedAt, stop, freeDays: r.freeDays, wm: wmOf(r.cbm, r.weightKg), today });
  const customsStart = receivedInstant ? pragueDate(receivedInstant) : isIsoDate(r.receivedAt) ? r.receivedAt : null;
  return {
    ...fields,
    source: r.source ?? "manual",
    movementId: movementId ?? null,
    taskId: taskId ?? null,
    positionRef: positionRef ?? "",
    jobNumber: jobNumber ?? "",
    positionArchived: !!positionArchived,
    closed,
    closedAt: iso(closedAt),
    closedReason: r.closedReason ?? "",
    receivedInstant: iso(receivedInstant),
    customsRegime: r.customsRegime ?? "",
    customsClock: customsClock({ regime: lineRegime(r), start: customsStart, stop: stop ?? (closed ? today : null), today }),
    wm: clock.wm,
    daysInStock: clock.daysInWarehouse,
    overFreeTime: clock.daysInWarehouse - clock.freeDays,
    freeTimeState: clock.state === "Not started" ? "Within free time" : clock.state,
    lastFreeDay: clock.lastFreeDay,
    chargeableDays: clock.chargeableDays,
    accruedCzk: clock.estimatedCzk,
    ...stamps(r),
  };
}

function stockLineFields(input: WarehouseStockLineInput) {
  const { movementId: _m, ...rest } = input;
  input = rest;
  requireText(input.job, "House job");
  requireText(input.receivedAt, "Received date");
  checkDate(input.receivedAt, "Received date");
  checkOneOf(input.status, STOCK_STATUSES, "Status");
  checkOneOf(input.customs, STOCK_CUSTOMS, "Customs");
  for (const [key, label] of [
    ["pieces", "Pieces"],
    ["weightKg", "Gross weight"],
    ["cbm", "Volume"],
    ["freeDays", "Free days"],
  ] as const) {
    checkNotNegative(input[key], label);
  }
  return {
    ...input,
    ...(input.job !== undefined ? { job: input.job.trim() } : {}),
    ...(input.location !== undefined ? { location: input.location.trim().toUpperCase() } : {}),
  };
}

// ---------- Zones ----------

// A bay code is the zone and bay number, e.g. "A-04"; a location adds the level ("A-04-2").
const bayOf = (location: string) => location.match(/^([A-Z]+-\d+)/)?.[1] ?? "";

export function zoneItem(z: ZoneRow, lines: Pick<StockLineRow, "location" | "pieces">[]): WarehouseZoneItem {
  const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = z;
  const inZone = lines.filter((l) => l.location.startsWith(`${z.code}-`));
  const usedBays = new Set(inZone.map((l) => bayOf(l.location)).filter(Boolean)).size;
  const occupied = inZone.reduce((sum, l) => sum + l.pieces, 0);
  // Racked zones count pallet positions; floor zones (capacity 0) count bays.
  const fullPercent = z.capacity ? Math.round((occupied / z.capacity) * 100) : z.bays ? Math.round((usedBays / z.bays) * 100) : 0;
  return { ...fields, usedBays, occupied, fullPercent, ...stamps(z) };
}

function zoneFields(input: WarehouseZoneInput) {
  requireText(input.code, "Zone");
  checkNotNegative(input.bays, "Bays");
  checkNotNegative(input.capacity, "Capacity");
  return {
    ...input,
    ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
    ...(input.blockedBays !== undefined
      ? { blockedBays: input.blockedBays.split(",").map((b) => b.trim().toUpperCase()).filter(Boolean).join(", ") }
      : {}),
  };
}

// ---------- Movements ----------

export function movementItem(r: MovementRow): WarehouseStockMovementItem {
  const { companyId: _c, deletedAt: _d, updatedAt: _ua, createdAt, taskId: _t, movementId, source, ...fields } = r;
  return { ...fields, source: source ?? "manual", movementId: movementId ?? null, createdAt: createdAt.toISOString() };
}

// ---------- Bonded register ----------

type BondedIn = BondedRow & Partial<PositionLink>;

const bondedRegime = (r: Pick<BondedRow, "procedure"> & { regime?: string | null }): CustomsRegime =>
  (r.regime as CustomsRegime) || (/^71/.test(r.procedure) ? "Customs warehouse" : "");

export function bondedItem(r: BondedIn, now = new Date()): WarehouseBondedEntryItem {
  const {
    companyId: _c,
    deletedAt: _d,
    createdAt: _ca,
    updatedAt: _ua,
    positionRef,
    gateRef: _g,
    jobNumber,
    positionArchived,
    enteredAt,
    dischargedAt,
    movementId,
    taskId,
    ...fields
  } = r;
  const voided = !!r.voidedReason;
  const open = !voided && !dischargedAt && r.balance > 0;
  const today = pragueDate(now);
  const start = enteredAt ? pragueDate(enteredAt) : isIsoDate(r.entryDate) ? r.entryDate : null;
  const stop = dischargedAt ? pragueDate(dischargedAt) : open ? null : pragueDate(r.updatedAt);
  return {
    ...fields,
    source: r.source ?? "manual",
    movementId: movementId ?? null,
    taskId: taskId ?? null,
    positionRef: positionRef ?? "",
    jobNumber: jobNumber ?? "",
    positionArchived: !!positionArchived,
    regime: r.regime ?? "",
    enteredAt: iso(enteredAt),
    dischargedAt: iso(dischargedAt),
    dischargeRef: r.dischargeRef ?? "",
    deadline: r.deadline ?? "",
    voidedReason: r.voidedReason ?? "",
    mrnMissing: !r.mrn.trim(),
    customsClock: customsClock({ regime: bondedRegime(r), start, stop, today }),
    status: voided ? "Voided" : open ? "In stock" : "Discharged",
    ...stamps(r),
  };
}

function bondedFields(input: WarehouseBondedEntryInput) {
  const { movementId: _m, ...rest } = input;
  input = rest;
  checkDate(input.entryDate, "Entry date");
  checkNotNegative(input.pieces, "Pieces");
  checkNotNegative(input.weightKg, "Gross weight");
  checkNotNegative(input.balance, "Balance");
  return { ...input, ...(input.mrn !== undefined ? { mrn: input.mrn.trim().toUpperCase() } : {}) };
}

class WarehouseStockService {
  // ---- stock lines ----

  /** Lines with their position; `openOnly` leaves out the lines that left or were voided. */
  async listStockLines(companyId: string, opts: { openOnly?: boolean } = {}) {
    const rows = await stockLineRepository.listWithPosition(companyId, 5000);
    const now = new Date();
    return rows
      .filter((r) => !opts.openOnly || !isClosedLine(r))
      .map((r) => stockLineItem(r, now))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  private async lineById(id: string, companyId: string) {
    const row = (await stockLineRepository.listWithPosition(companyId, 5000)).find((r) => r.id === id);
    if (!row) throw notFound("Stock line");
    return stockLineItem(row);
  }

  /** The position picked for a manual line / entry: its id, task and WCZ ref (the house job). */
  private async pickedPosition(companyId: string, movementId: string | null | undefined) {
    if (!movementId) return null;
    const m = await stockGateReader.findForCompany(companyId, movementId);
    if (!m) throw APIError.invalidArgument("Position not found — pick it again");
    return { movementId: m.id, taskId: m.warehouseTaskId, job: m.positionRef || m.gateRef };
  }

  // A line typed by hand: linked to a position by the picker (its WCZ ref becomes the house job),
  // or — for odd cases — not linked, with the house job typed.
  async createStockLine(companyId: string, input: WarehouseStockLineInput) {
    const pos = await this.pickedPosition(companyId, input.movementId);
    if (!pos && !input.job?.trim()) throw APIError.invalidArgument("Pick the position (or type the house job when it has none)");
    if (!input.receivedAt) throw APIError.invalidArgument("Received date is required");
    const fields = stockLineFields(pos ? { ...input, job: pos.job } : input);
    const closing = fields.status && CLOSED_STATUSES.includes(fields.status) ? { closedAt: new Date(), closedReason: "Marked picked by hand" } : {};
    const row = await stockLineRepository.createForCompany(companyId, {
      ...fields,
      ...closing,
      source: "manual",
      movementId: pos?.movementId ?? null,
      taskId: pos?.taskId ?? null,
    } as typeof warehouseStockLineTable.$inferInsert);
    return this.lineById(row.id, companyId);
  }

  // An automatic line follows its gate record: only where it sits (location), On hold / Allocated,
  // the consol and the marks are changed here. The form may send the other fields unchanged.
  async updateStockLine(id: string, companyId: string, input: WarehouseStockLineInput) {
    const cur = await stockLineRepository.getByIdForCompany(id, companyId);
    if (!cur) throw notFound("Stock line");
    let patch: Partial<typeof warehouseStockLineTable.$inferInsert>;
    if (cur.source === "auto") {
      const labels: Record<string, string> = { job: "House job", customer: "Customer", shipper: "Shipper", pod: "POD", pieces: "Pieces", packageType: "Package", weightKg: "Gross weight", cbm: "Volume", receivedAt: "Received date", freeDays: "Free days", customs: "Customs" };
      for (const [key, label] of Object.entries(labels)) {
        const v = (input as Record<string, unknown>)[key];
        if (v !== undefined && v !== null && v !== (cur as Record<string, unknown>)[key]) throw APIError.failedPrecondition(`${label} ${FOLLOWS_GATE}`);
      }
      if (input.movementId !== undefined && (input.movementId || null) !== cur.movementId) throw APIError.failedPrecondition(`The position ${FOLLOWS_GATE}`);
      if (input.status !== undefined && input.status !== cur.status) {
        if (isClosedLine(cur)) throw APIError.failedPrecondition(`This line is closed (${cur.closedReason || cur.status}) — it opens again only from the gate`);
        checkOneOf(input.status, AUTO_LINE_STATUSES, "Status");
      }
      const picked = Object.fromEntries(AUTO_LINE_EDITABLE.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
      patch = stockLineFields(picked as WarehouseStockLineInput);
    } else {
      const pos = input.movementId !== undefined ? await this.pickedPosition(companyId, input.movementId) : undefined;
      patch = stockLineFields(pos ? { ...input, job: pos.job } : input);
      if (pos !== undefined) {
        patch.movementId = pos?.movementId ?? null;
        patch.taskId = pos?.taskId ?? null;
        if (!pos && !(patch.job ?? cur.job).trim()) throw APIError.invalidArgument("Type the house job when no position is picked");
      }
      // A manual line marked Picked is closed; back to an open status opens it again.
      if (patch.status && patch.status !== cur.status) {
        if (CLOSED_STATUSES.includes(patch.status)) Object.assign(patch, { closedAt: new Date(), closedReason: "Marked picked by hand" });
        else Object.assign(patch, { closedAt: null, closedReason: "" });
      }
    }
    if (!(await stockLineRepository.updateForCompany(id, companyId, patch))) throw notFound("Stock line");
    return this.lineById(id, companyId);
  }

  async deleteStockLine(id: string, companyId: string) {
    const cur = await stockLineRepository.getByIdForCompany(id, companyId);
    if (!cur) throw notFound("Stock line");
    if (cur.source === "auto") throw APIError.failedPrecondition("This line follows the gate record — it closes when the position leaves (or a manager voids the receipt)");
    if (!(await stockLineRepository.softDeleteForCompany(id, companyId))) throw notFound("Stock line");
  }

  // ---- build stock from gate records (manager) ----

  // Runs the gate sync on every live gate record (repair / first build after the migration).
  // Positions that already have an open manual line linked get no automatic line; they are listed.
  async syncFromGate(companyId: string, userId: string, dryRun: boolean): Promise<WarehouseStockSyncResult> {
    const ids = await stockGateReader.liveIds(companyId);
    const by = (await userName(userId)) || "Build stock from gate records";
    const opts = { by, why: "built from the gate records" };
    const out: WarehouseStockSyncResult = {
      dryRun,
      positions: ids.length,
      linesCreated: 0,
      linesClosed: 0,
      linesVoided: 0,
      linesReopened: 0,
      bondedOpened: 0,
      bondedDischarged: 0,
      bondedVoided: 0,
      manualLineExists: [],
    };
    for (const id of ids) {
      let plan;
      let ref = "";
      if (dryRun) {
        const p = await previewStockSync(companyId, id, opts);
        plan = p?.plan ?? null;
        ref = p?.ref ?? "";
      } else {
        plan = (await syncStockForMovements(companyId, [id], opts))[0]?.plan ?? null;
      }
      if (!plan) continue;
      if (plan.skippedManual) out.manualLineExists.push(ref || (await stockGateReader.movement(companyId, id))?.gateRef || id);
      const lc = plan.lineChange ?? "";
      if (lc === "none->open") out.linesCreated++;
      else if (lc.endsWith("->left")) out.linesClosed++;
      else if (lc.endsWith("->voided")) out.linesVoided++;
      else if (lc.endsWith("->open")) out.linesReopened++;
      const ec = plan.entryChange ?? "";
      if (ec.endsWith("->open")) out.bondedOpened++;
      else if (ec.endsWith("->discharged")) out.bondedDischarged++;
      else if (ec.endsWith("->voided")) out.bondedVoided++;
    }
    return out;
  }

  // ---- zones ----

  // Only what is on hand occupies a zone (lines that left or were voided do not).
  private async onHand(companyId: string) {
    return (await stockLineRepository.listForCompany(companyId, 5000)).filter((l) => !isClosedLine(l));
  }

  async listZones(companyId: string) {
    const [zones, lines] = await Promise.all([zoneRepository.listForCompany(companyId, 500), this.onHand(companyId)]);
    return zones.map((z) => zoneItem(z, lines)).sort((a, b) => a.code.localeCompare(b.code));
  }

  private async zoneById(id: string, companyId: string) {
    const [z, lines] = await Promise.all([zoneRepository.getByIdForCompany(id, companyId), this.onHand(companyId)]);
    if (!z) throw notFound("Zone");
    return zoneItem(z, lines);
  }

  async createZone(companyId: string, input: WarehouseZoneInput) {
    if (!input.code?.trim()) throw APIError.invalidArgument("Zone is required");
    const row = await zoneRepository.createForCompany(companyId, zoneFields(input) as typeof warehouseZoneTable.$inferInsert);
    return this.zoneById(row.id, companyId);
  }

  async updateZone(id: string, companyId: string, input: WarehouseZoneInput) {
    if (!(await zoneRepository.updateForCompany(id, companyId, zoneFields(input)))) throw notFound("Zone");
    return this.zoneById(id, companyId);
  }

  async deleteZone(id: string, companyId: string) {
    if (!(await zoneRepository.softDeleteForCompany(id, companyId))) throw notFound("Zone");
  }

  // ---- movements (append only) ----

  async listMovements(companyId: string) {
    const rows = await stockMovementRepository.listForCompany(companyId, 5000);
    return rows.map(movementItem).sort((a, b) => b.at.localeCompare(a.at) || b.createdAt.localeCompare(a.createdAt));
  }

  async recordMovement(companyId: string, userId: string, input: WarehouseStockMovementInput) {
    checkOneOf(input.type, MOVEMENT_TYPES, "Movement type");
    if (input.at && !DATETIME.test(input.at)) throw APIError.invalidArgument("Time must be YYYY-MM-DDTHH:MM");
    checkNotNegative(input.pieces, "Pieces");
    const row = await stockMovementRepository.createForCompany(companyId, {
      ...input,
      at: input.at || new Date().toISOString().slice(0, 16),
      userName: await userName(userId),
      source: "manual",
    } as typeof warehouseStockMovementTable.$inferInsert);
    return movementItem(row);
  }

  // ---- bonded register ----

  async listBonded(companyId: string) {
    const rows = await bondedEntryRepository.listWithPosition(companyId, 5000);
    const now = new Date();
    return rows.map((r) => bondedItem(r, now)).sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }

  private async bondedById(id: string, companyId: string) {
    const row = (await bondedEntryRepository.listWithPosition(companyId, 5000)).find((r) => r.id === id);
    if (!row) throw notFound("Bonded entry");
    return bondedItem(row);
  }

  // A manual entry linked to a position may wait for its MRN; one not linked needs it.
  async createBonded(companyId: string, input: WarehouseBondedEntryInput) {
    const pos = await this.pickedPosition(companyId, input.movementId);
    if (!pos && !input.mrn?.trim()) throw APIError.invalidArgument("MRN is required (or pick the position, and add the MRN later)");
    // A new entry starts with its whole quantity under customs control.
    const fields = bondedFields({ ...input, ...(pos ? { job: pos.job } : {}), balance: input.balance ?? input.pieces ?? 0 });
    const row = await bondedEntryRepository.createForCompany(companyId, {
      ...fields,
      mrn: fields.mrn ?? "",
      source: "manual",
      movementId: pos?.movementId ?? null,
      taskId: pos?.taskId ?? null,
    } as typeof warehouseBondedEntryTable.$inferInsert);
    return this.bondedById(row.id, companyId);
  }

  // An automatic entry follows the gate record; only a missing MRN or discharge reference is
  // filled in here.
  async updateBonded(id: string, companyId: string, input: WarehouseBondedEntryInput) {
    const cur = await bondedEntryRepository.getByIdForCompany(id, companyId);
    if (!cur) throw notFound("Bonded entry");
    let patch: Partial<typeof warehouseBondedEntryTable.$inferInsert>;
    if (cur.source === "auto") {
      const labels: Record<string, string> = { job: "House job", consignee: "Consignee", procedure: "Procedure", entryDate: "Entry date", pieces: "Pieces", weightKg: "Gross weight", customsValue: "Customs value", discharge: "Discharge", balance: "Balance" };
      for (const [key, label] of Object.entries(labels)) {
        const v = (input as Record<string, unknown>)[key];
        if (v !== undefined && v !== null && v !== (cur as Record<string, unknown>)[key]) throw APIError.failedPrecondition(`${label} ${FOLLOWS_GATE}`);
      }
      if (input.movementId !== undefined && (input.movementId || null) !== cur.movementId) throw APIError.failedPrecondition(`The position ${FOLLOWS_GATE}`);
      patch = {};
      const mrn = input.mrn?.trim().toUpperCase();
      if (mrn !== undefined && mrn !== cur.mrn) {
        if (cur.mrn) throw APIError.failedPrecondition(`The MRN is recorded (${cur.mrn}) — correct it on the position`);
        patch.mrn = mrn;
      }
      const ref = input.dischargeRef?.trim();
      if (ref !== undefined && ref !== cur.dischargeRef) {
        if (cur.dischargeRef) throw APIError.failedPrecondition("The discharge reference is recorded — it follows the gate record");
        if (!cur.dischargedAt) throw APIError.failedPrecondition("The entry is not discharged yet");
        patch.dischargeRef = ref.slice(0, 500);
        patch.discharge = `${pragueDate(cur.dischargedAt)} · ${ref}`.slice(0, 500);
      }
    } else {
      const pos = input.movementId !== undefined ? await this.pickedPosition(companyId, input.movementId) : undefined;
      patch = bondedFields(pos ? { ...input, job: pos.job } : input);
      if (pos !== undefined) {
        patch.movementId = pos?.movementId ?? null;
        patch.taskId = pos?.taskId ?? null;
      }
      const linkedAfter = pos !== undefined ? !!pos : !!cur.movementId;
      if (!linkedAfter && patch.mrn !== undefined && !patch.mrn) throw APIError.invalidArgument("MRN is required (or pick the position)");
    }
    if (!(await bondedEntryRepository.updateForCompany(id, companyId, patch))) throw notFound("Bonded entry");
    return this.bondedById(id, companyId);
  }

  async deleteBonded(id: string, companyId: string) {
    const cur = await bondedEntryRepository.getByIdForCompany(id, companyId);
    if (!cur) throw notFound("Bonded entry");
    if (cur.source === "auto") throw APIError.failedPrecondition("This customs entry follows the gate record — it is discharged when the position leaves");
    if (!(await bondedEntryRepository.softDeleteForCompany(id, companyId))) throw notFound("Bonded entry");
  }
}

export const warehouseStockService = new WarehouseStockService();
