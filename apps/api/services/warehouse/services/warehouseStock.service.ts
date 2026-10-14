import { APIError } from "encore.dev/api";
import { pragueDate, storageClock, wmOf } from "./storage";
import { auth } from "~encore/clients";
import {
  bondedEntryRepository,
  stockLineRepository,
  stockMovementRepository,
  zoneRepository,
} from "../repositories/warehouseStock.repository";
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
  WarehouseZoneInput,
  WarehouseZoneItem,
} from "../interfaces/stock.interfaces";

type StockLineRow = typeof warehouseStockLineTable.$inferSelect;
type ZoneRow = typeof warehouseZoneTable.$inferSelect;
type MovementRow = typeof warehouseStockMovementTable.$inferSelect;
type BondedRow = typeof warehouseBondedEntryTable.$inferSelect;

export const STOCK_STATUSES = ["Available", "Allocated", "On hold", "Picked"];
export const STOCK_CUSTOMS = ["Free circulation", "T1 bonded", "Export cleared"];
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
export function stockLineItem(r: StockLineRow, now = new Date()): WarehouseStockLineItem {
  const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = r;
  const clock = storageClock({ start: r.receivedAt, stop: null, freeDays: r.freeDays, wm: wmOf(r.cbm, r.weightKg), today: pragueDate(now) });
  return {
    ...fields,
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
  const { companyId: _c, deletedAt: _d, updatedAt: _ua, createdAt, ...fields } = r;
  return { ...fields, createdAt: createdAt.toISOString() };
}

// ---------- Bonded register ----------

export function bondedItem(r: BondedRow): WarehouseBondedEntryItem {
  const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = r;
  return { ...fields, status: r.balance > 0 ? "In stock" : "Discharged", ...stamps(r) };
}

function bondedFields(input: WarehouseBondedEntryInput) {
  requireText(input.mrn, "MRN");
  checkDate(input.entryDate, "Entry date");
  checkNotNegative(input.pieces, "Pieces");
  checkNotNegative(input.weightKg, "Gross weight");
  checkNotNegative(input.balance, "Balance");
  return { ...input, ...(input.mrn !== undefined ? { mrn: input.mrn.trim().toUpperCase() } : {}) };
}

class WarehouseStockService {
  // ---- stock lines ----

  async listStockLines(companyId: string) {
    const rows = await stockLineRepository.listForCompany(companyId, 5000);
    const now = new Date();
    return rows.map((r) => stockLineItem(r, now)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async createStockLine(companyId: string, input: WarehouseStockLineInput) {
    if (!input.job?.trim()) throw APIError.invalidArgument("House job is required");
    if (!input.receivedAt) throw APIError.invalidArgument("Received date is required");
    const row = await stockLineRepository.createForCompany(companyId, stockLineFields(input) as typeof warehouseStockLineTable.$inferInsert);
    return stockLineItem(row);
  }

  async updateStockLine(id: string, companyId: string, input: WarehouseStockLineInput) {
    const row = await stockLineRepository.updateForCompany(id, companyId, stockLineFields(input));
    if (!row) throw notFound("Stock line");
    return stockLineItem(row);
  }

  async deleteStockLine(id: string, companyId: string) {
    if (!(await stockLineRepository.softDeleteForCompany(id, companyId))) throw notFound("Stock line");
  }

  // ---- zones ----

  async listZones(companyId: string) {
    const [zones, lines] = await Promise.all([zoneRepository.listForCompany(companyId, 500), stockLineRepository.listForCompany(companyId, 5000)]);
    return zones.map((z) => zoneItem(z, lines)).sort((a, b) => a.code.localeCompare(b.code));
  }

  private async zoneById(id: string, companyId: string) {
    const [z, lines] = await Promise.all([zoneRepository.getByIdForCompany(id, companyId), stockLineRepository.listForCompany(companyId, 5000)]);
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
    } as typeof warehouseStockMovementTable.$inferInsert);
    return movementItem(row);
  }

  // ---- bonded register ----

  async listBonded(companyId: string) {
    const rows = await bondedEntryRepository.listForCompany(companyId, 5000);
    return rows.map(bondedItem).sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }

  async createBonded(companyId: string, input: WarehouseBondedEntryInput) {
    if (!input.mrn?.trim()) throw APIError.invalidArgument("MRN is required");
    // A new entry starts with its whole quantity under customs control.
    const fields = bondedFields({ ...input, balance: input.balance ?? input.pieces ?? 0 });
    return bondedItem(await bondedEntryRepository.createForCompany(companyId, fields as typeof warehouseBondedEntryTable.$inferInsert));
  }

  async updateBonded(id: string, companyId: string, input: WarehouseBondedEntryInput) {
    const row = await bondedEntryRepository.updateForCompany(id, companyId, bondedFields(input));
    if (!row) throw notFound("Bonded entry");
    return bondedItem(row);
  }

  async deleteBonded(id: string, companyId: string) {
    if (!(await bondedEntryRepository.softDeleteForCompany(id, companyId))) throw notFound("Bonded entry");
  }
}

async function userName(userId: string): Promise<string> {
  try {
    const { users } = await auth.usersList();
    const me = users.find((u) => u.id === userId);
    return me?.displayName || me?.email || "";
  } catch {
    return "";
  }
}

export const warehouseStockService = new WarehouseStockService();
