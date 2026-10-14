import { APIError } from "encore.dev/api";
import {
  claimRepository,
  containerRepository,
  dockSlotRepository,
  equipmentRepository,
  savedReportRepository,
  staffRepository,
} from "../repositories/warehouseRecords.repository";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import type {
  warehouseClaimTable,
  warehouseContainerTable,
  warehouseDockSlotTable,
  warehouseEquipmentTable,
  warehouseSavedReportTable,
  warehouseStaffTable,
} from "../schemas/warehouseRecords.schema";
import type {
  LaneFill,
  MonthlySummary,
  WarehouseClaimInput,
  WarehouseClaimItem,
  WarehouseContainerInput,
  WarehouseContainerItem,
  WarehouseDockSlotInput,
  WarehouseDockSlotItem,
  WarehouseEquipmentInput,
  WarehouseEquipmentItem,
  WarehouseReportSummary,
  WarehouseSavedReportInput,
  WarehouseSavedReportItem,
  WarehouseStaffInput,
  WarehouseStaffItem,
} from "../interfaces/records.interfaces";

type ContainerRow = typeof warehouseContainerTable.$inferSelect;
type SlotRow = typeof warehouseDockSlotTable.$inferSelect;

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const stamps = (r: { createdAt: Date; updatedAt: Date }) => ({ createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const notFound = (what: string) => APIError.notFound(`${what} not found`);

// Whole days between two YYYY-MM-DD dates (UTC calendar days).
const dayIndex = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

const requireText = (value: string | undefined, label: string) => {
  if (value !== undefined && !value.trim()) throw APIError.invalidArgument(`${label} is required`);
};
const checkDate = (value: string | undefined, label: string) => {
  if (value && !DATE.test(value)) throw APIError.invalidArgument(`${label} must be a date (YYYY-MM-DD)`);
};

// ---------- Containers ----------

// Usable volume per equipment type, for fill rates.
export const EQUIPMENT_CAPACITY_CBM: Record<string, number> = {
  "20' DV": 31,
  "40' DV": 66,
  "40' HC": 76,
  "45' HC": 84,
  "20' OT": 31,
  "40' FR": 0,
};

export function containerItem(c: ContainerRow, movement: GateMovementRow | undefined, now = new Date()): WarehouseContainerItem {
  const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = c;
  const daysOnYard = c.gatedIn ? Math.max(0, dayIndex(c.gatedOut || todayIso(now)) - dayIndex(c.gatedIn)) : null;
  return {
    ...fields,
    warehouseTaskId: movement?.warehouseTaskId ?? null,
    positionRef: movement?.positionRef ?? "",
    customer: movement?.customer ?? "",
    handling: movement?.handling ?? "",
    vgmKg: c.tareKg != null && c.cargoKg != null ? c.tareKg + c.cargoKg : null,
    daysOnYard,
    ...stamps(c),
  };
}

function containerFields(input: WarehouseContainerInput) {
  requireText(input.number, "Container number");
  for (const [key, label] of [
    ["gatedIn", "Gated in"],
    ["gatedOut", "Gated out"],
    ["detentionExpiry", "Detention expiry"],
  ] as const) {
    checkDate(input[key], label);
  }
  if (input.direction !== undefined && !["Loading", "Unloading"].includes(input.direction)) {
    throw APIError.invalidArgument("Direction must be Loading or Unloading");
  }
  return { ...input, ...(input.number !== undefined ? { number: input.number.trim().toUpperCase() } : {}) };
}

class WarehouseRecordsService {
  private async movementsById(companyId: string) {
    return new Map((await gateMovementRepository.listAll(companyId)).map((m) => [m.id, m]));
  }

  async listContainers(companyId: string) {
    const [rows, movements] = await Promise.all([containerRepository.listForCompany(companyId, 5000), this.movementsById(companyId)]);
    return rows.map((c) => containerItem(c, c.movementId ? movements.get(c.movementId) : undefined));
  }

  private async containerById(id: string, companyId: string) {
    const c = await containerRepository.getByIdForCompany(id, companyId);
    if (!c) throw notFound("Container");
    const movement = c.movementId ? await gateMovementRepository.findById(c.movementId, companyId) : null;
    return containerItem(c, movement ?? undefined);
  }

  async createContainer(companyId: string, input: WarehouseContainerInput) {
    if (!input.number?.trim()) throw APIError.invalidArgument("Container number is required");
    if (input.movementId && !(await gateMovementRepository.findById(input.movementId, companyId))) {
      throw APIError.invalidArgument("Position not found");
    }
    const row = await containerRepository.createForCompany(companyId, containerFields(input) as typeof warehouseContainerTable.$inferInsert);
    return this.containerById(row.id, companyId);
  }

  async updateContainer(id: string, companyId: string, input: WarehouseContainerInput) {
    if (input.movementId && !(await gateMovementRepository.findById(input.movementId, companyId))) {
      throw APIError.invalidArgument("Position not found");
    }
    const row = await containerRepository.updateForCompany(id, companyId, containerFields(input));
    if (!row) throw notFound("Container");
    return this.containerById(id, companyId);
  }

  async deleteContainer(id: string, companyId: string) {
    if (!(await containerRepository.softDeleteForCompany(id, companyId))) throw notFound("Container");
  }

  // ---------- Dock slots ----------

  private slotItem = (s: SlotRow): WarehouseDockSlotItem => {
    const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = s;
    return { ...fields, ...stamps(s) };
  };

  private slotFields(input: WarehouseDockSlotInput) {
    checkDate(input.date, "Date");
    if (input.time !== undefined && !TIME.test(input.time)) throw APIError.invalidArgument("Time must be HH:MM");
    requireText(input.dock, "Dock");
    if (input.direction !== undefined && !["IN", "OUT"].includes(input.direction)) throw APIError.invalidArgument("Direction must be IN or OUT");
    return input;
  }

  async listDockSlots(companyId: string) {
    return (await dockSlotRepository.listForCompany(companyId, 5000)).map(this.slotItem);
  }

  async createDockSlot(companyId: string, input: WarehouseDockSlotInput) {
    if (!input.date || !input.time || !input.dock) throw APIError.invalidArgument("Date, time and dock are required");
    return this.slotItem(await dockSlotRepository.createForCompany(companyId, this.slotFields(input) as typeof warehouseDockSlotTable.$inferInsert));
  }

  async updateDockSlot(id: string, companyId: string, input: WarehouseDockSlotInput) {
    const row = await dockSlotRepository.updateForCompany(id, companyId, this.slotFields(input));
    if (!row) throw notFound("Dock slot");
    return this.slotItem(row);
  }

  async deleteDockSlot(id: string, companyId: string) {
    if (!(await dockSlotRepository.softDeleteForCompany(id, companyId))) throw notFound("Dock slot");
  }

  // ---------- Shift roster ----------

  private staffItem = (s: typeof warehouseStaffTable.$inferSelect): WarehouseStaffItem => {
    const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = s;
    return { ...fields, ...stamps(s) };
  };

  async listStaff(companyId: string) {
    return (await staffRepository.listForCompany(companyId)).map(this.staffItem);
  }

  async createStaff(companyId: string, input: WarehouseStaffInput) {
    if (!input.name?.trim()) throw APIError.invalidArgument("Name is required");
    return this.staffItem(await staffRepository.createForCompany(companyId, input as typeof warehouseStaffTable.$inferInsert));
  }

  async updateStaff(id: string, companyId: string, input: WarehouseStaffInput) {
    requireText(input.name, "Name");
    const row = await staffRepository.updateForCompany(id, companyId, input);
    if (!row) throw notFound("Shift roster entry");
    return this.staffItem(row);
  }

  async deleteStaff(id: string, companyId: string) {
    if (!(await staffRepository.softDeleteForCompany(id, companyId))) throw notFound("Shift roster entry");
  }

  // ---------- Equipment ----------

  private equipmentItem = (e: typeof warehouseEquipmentTable.$inferSelect): WarehouseEquipmentItem => {
    const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = e;
    return { ...fields, ...stamps(e) };
  };

  async listEquipment(companyId: string) {
    return (await equipmentRepository.listForCompany(companyId)).map(this.equipmentItem);
  }

  async createEquipment(companyId: string, input: WarehouseEquipmentInput) {
    if (!input.code?.trim()) throw APIError.invalidArgument("Equipment ID is required");
    return this.equipmentItem(await equipmentRepository.createForCompany(companyId, input as typeof warehouseEquipmentTable.$inferInsert));
  }

  async updateEquipment(id: string, companyId: string, input: WarehouseEquipmentInput) {
    requireText(input.code, "Equipment ID");
    const row = await equipmentRepository.updateForCompany(id, companyId, input);
    if (!row) throw notFound("Equipment");
    return this.equipmentItem(row);
  }

  async deleteEquipment(id: string, companyId: string) {
    if (!(await equipmentRepository.softDeleteForCompany(id, companyId))) throw notFound("Equipment");
  }

  // ---------- Claims ----------

  private claimItem = (c: typeof warehouseClaimTable.$inferSelect): WarehouseClaimItem => {
    const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = c;
    return { ...fields, ...stamps(c) };
  };

  async listClaims(companyId: string) {
    return (await claimRepository.listForCompany(companyId)).map(this.claimItem);
  }

  // Claims are numbered CL-YY-0001 per company and (Prague) year; numbers are never reused
  // and never repeat when two claims are created at once.
  async createClaim(companyId: string, input: WarehouseClaimInput, now = new Date()) {
    checkDate(input.raised, "Raised");
    const year = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", year: "2-digit" }).format(now);
    const row = await claimRepository.createNumbered(companyId, `CL-${year}-`, { ...input, raised: input.raised || todayIso(now) } as typeof warehouseClaimTable.$inferInsert);
    return this.claimItem(row);
  }

  async updateClaim(id: string, companyId: string, input: WarehouseClaimInput) {
    checkDate(input.raised, "Raised");
    const row = await claimRepository.updateForCompany(id, companyId, input);
    if (!row) throw notFound("Claim");
    return this.claimItem(row);
  }

  async deleteClaim(id: string, companyId: string) {
    if (!(await claimRepository.softDeleteForCompany(id, companyId))) throw notFound("Claim");
  }

  // ---------- Report library ----------

  private reportItem = (r: typeof warehouseSavedReportTable.$inferSelect): WarehouseSavedReportItem => {
    const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, ...fields } = r;
    return { ...fields, ...stamps(r) };
  };

  async listSavedReports(companyId: string) {
    return (await savedReportRepository.listForCompany(companyId)).map(this.reportItem);
  }

  async createSavedReport(companyId: string, input: WarehouseSavedReportInput) {
    if (!input.name?.trim()) throw APIError.invalidArgument("Report name is required");
    return this.reportItem(await savedReportRepository.createForCompany(companyId, input as typeof warehouseSavedReportTable.$inferInsert));
  }

  async updateSavedReport(id: string, companyId: string, input: WarehouseSavedReportInput) {
    requireText(input.name, "Report name");
    const row = await savedReportRepository.updateForCompany(id, companyId, input);
    if (!row) throw notFound("Report");
    return this.reportItem(row);
  }

  async deleteSavedReport(id: string, companyId: string) {
    if (!(await savedReportRepository.softDeleteForCompany(id, companyId))) throw notFound("Report");
  }

  // ---------- Calculated reports ----------

  async reportSummary(companyId: string, now = new Date()): Promise<WarehouseReportSummary> {
    const [movements, containerRows, slots] = await Promise.all([
      gateMovementRepository.listAll(companyId),
      containerRepository.listForCompany(companyId, 5000),
      dockSlotRepository.listForCompany(companyId, 5000),
    ]);
    return buildReportSummary(movements, containerRows, slots, now);
  }
}

// ---------- report calculations (pure, exported for tests) ----------

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
// Received = gate-in (or load-in date); dispatched = gate-out (or the WH release stamp).
const receivedOn = (m: GateMovementRow) => isoDate(m.gateIn) || m.loadInDate;
const dispatchedOn = (m: GateMovementRow) => isoDate(m.gateOut) || isoDate(m.impRelease);
const wmOf = (m: GateMovementRow) => Math.max(m.measureCbm, m.weightKg / 1000);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ISO week number and the Monday that starts it.
function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  const monday = new Date(d.getTime() - (day - 1) * DAY);
  const thursday = new Date(d.getTime() + (4 - day) * DAY);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / DAY + 1) / 7);
  return { week, monday: monday.toISOString().slice(0, 10) };
}

export function buildReportSummary(movements: GateMovementRow[], containers: ContainerRow[], slots: SlotRow[], now = new Date()): WarehouseReportSummary {
  const today = todayIso(now);

  // Throughput — the last 8 ISO weeks, oldest first.
  const thisMonday = isoWeek(now).monday;
  const throughput = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(Date.parse(`${thisMonday}T00:00:00Z`) - (7 - i) * 7 * DAY);
    const from = start.toISOString().slice(0, 10);
    const to = new Date(start.getTime() + 7 * DAY).toISOString().slice(0, 10);
    const inWeek = (d: string) => !!d && d >= from && d < to;
    return {
      week: `W${isoWeek(start).week}`,
      receivedCbm: round(movements.filter((m) => inWeek(receivedOn(m))).reduce((a, m) => a + m.measureCbm, 0)),
      dispatchedCbm: round(movements.filter((m) => inWeek(dispatchedOn(m))).reduce((a, m) => a + m.measureCbm, 0)),
    };
  });

  // Top customers by volume received this month.
  const month = today.slice(0, 7);
  const receivedThisMonth = movements.filter((m) => receivedOn(m).startsWith(month));
  const monthCbm = receivedThisMonth.reduce((a, m) => a + m.measureCbm, 0);
  const byCustomer = new Map<string, { jobs: number; cbm: number; wm: number }>();
  for (const m of receivedThisMonth) {
    const key = m.customer || "(no customer)";
    const e = byCustomer.get(key) ?? { jobs: 0, cbm: 0, wm: 0 };
    e.jobs += 1;
    e.cbm += m.measureCbm;
    e.wm += wmOf(m);
    byCustomer.set(key, e);
  }
  const topCustomers = [...byCustomer.entries()]
    .sort((a, b) => b[1].cbm - a[1].cbm)
    .slice(0, 5)
    .map(([customer, e]) => ({ customer, jobs: e.jobs, cbm: round(e.cbm), wm: round(e.wm), share: monthCbm ? Math.round((e.cbm / monthCbm) * 100) : 0 }));

  // Monthly summary — this month and the three before it, newest first.
  const monthly: MonthlySummary[] = Array.from({ length: 4 }, (_, i) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    const key = first.toISOString().slice(0, 7);
    const received = movements.filter((m) => receivedOn(m).startsWith(key));
    const dispatched = movements.filter((m) => dispatchedOn(m).startsWith(key));
    const firstDay = dayIndex(first.toISOString().slice(0, 10));
    const endDay = Math.min(dayIndex(next.toISOString().slice(0, 10)), dayIndex(today) + 1);
    const yardDays = containers.reduce((a, c) => {
      if (!c.gatedIn) return a;
      const inDay = dayIndex(c.gatedIn);
      const outDay = c.gatedOut ? dayIndex(c.gatedOut) : dayIndex(today) + 1;
      return a + Math.max(0, Math.min(outDay, endDay) - Math.max(inDay, firstDay));
    }, 0);
    return {
      month: key,
      monthToDate: i === 0,
      receipts: received.length,
      cbmIn: round(received.reduce((a, m) => a + m.measureCbm, 0)),
      dispatches: dispatched.length,
      cbmOut: round(dispatched.reduce((a, m) => a + m.measureCbm, 0)),
      consolPositions: received.filter((m) => m.loadType === "Consolidation").length,
      containersLoaded: containers.filter((c) => c.direction === "Loading" && c.gatedOut.startsWith(key)).length,
      fclStuffed: dispatched.filter((m) => m.operationType === "FCL stuffing").length,
      fclStripped: received.filter((m) => m.operationType === "FCL stripping").length,
      yardContainerDays: yardDays,
    };
  });

  // Fill rate of loaded containers by discharge port over the last 90 days.
  const since = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const byLane = new Map<string, { n: number; cbm: number; cap: number; fill: number; pieces: number }>();
  for (const c of containers) {
    const cap = EQUIPMENT_CAPACITY_CBM[c.equipment];
    const when = c.gatedOut || c.createdAt.toISOString().slice(0, 10);
    if (c.direction !== "Loading" || !cap || c.cbm == null || when < since) continue;
    const lane = c.dischargePort || "(no discharge port)";
    const e = byLane.get(lane) ?? { n: 0, cbm: 0, cap: 0, fill: 0, pieces: 0 };
    e.n += 1;
    e.cbm += c.cbm;
    e.cap += cap;
    e.fill += c.cbm / cap;
    e.pieces += c.pieces ?? 0;
    byLane.set(lane, e);
  }
  const lanes: LaneFill[] = [...byLane.entries()]
    .map(([lane, e]) => {
      const fill = Math.round((e.fill / e.n) * 100);
      return {
        lane,
        containers: e.n,
        avgCbm: round(e.cbm / e.n),
        capacityCbm: Math.round(e.cap / e.n),
        fill,
        avgPieces: round(e.pieces / e.n),
        verdict: fill >= 80 ? "Healthy" : fill >= 60 ? "Acceptable" : "Below target",
      };
    })
    .sort((a, b) => a.fill - b.fill);

  // Quality — damage from this year's surveys; on-time from outbound dock slots.
  const year = today.slice(0, 4);
  let surveyedPieces = 0;
  let damagedPieces = 0;
  for (const m of movements) {
    const surveys = m.surveys.filter((s) => (s.surveyedAt ?? "").startsWith(year));
    if (!surveys.length) continue;
    surveyedPieces += m.colli;
    damagedPieces += surveys.reduce((a, s) => a + (s.damaged ?? 0), 0);
  }
  const outbound = slots.filter((s) => s.direction === "OUT" && ["Completed", "Overdue"].includes(s.status));
  const quality = {
    surveyedPieces,
    damagedPieces,
    damageRate: surveyedPieces ? round((damagedPieces / surveyedPieces) * 100, 2) : null,
    onTimeDispatch: outbound.length ? round((outbound.filter((s) => s.status === "Completed").length / outbound.length) * 100) : null,
  };

  return { throughput, topCustomers, monthly, lanes, quality };
}

export const warehouseRecordsService = new WarehouseRecordsService();
