import { APIError } from "encore.dev/api";
import { db } from "../db/db";
import {
  claimRepository,
  containerPositionRepository,
  containerRepository,
  dockSlotRepository,
  equipmentRepository,
  savedReportRepository,
  staffRepository,
} from "../repositories/warehouseRecords.repository";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { movementStorage, pragueDate } from "./storage";
import { directionFits, EQUIPMENT_CAPACITY_CBM } from "./containerRules";
import { containerService } from "./container.service";
import {
  DOCK_SLOT_DEFAULT_MIN,
  DOCK_SLOT_MAX_MIN,
  DOCK_SLOT_MIN_MIN,
  DOCK_SLOT_NEEDS_POSITION,
  DOCK_SLOT_STATUSES,
  directionOfVisit,
  slotEnd,
  slotHoldsDock,
  slotWindow,
} from "./dockSlots";
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
  ShipmentUpdateHealth,
  WarehouseClaimInput,
  WarehouseClaimItem,
  WarehouseContainerInput,
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
import { isExclusionViolation } from "../../../lib/db/errors";

type ContainerRow = typeof warehouseContainerTable.$inferSelect;
type SlotRow = typeof warehouseDockSlotTable.$inferSelect;

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const stamps = (r: { createdAt: Date; updatedAt: Date }) => ({ createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const notFound = (what: string) => APIError.notFound(`${what} not found`);

// Whole days between two YYYY-MM-DD dates (UTC calendar days).
const dayIndex = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
// Today in Prague (the warehouse's day), as the gate stamps and the storage clock count it.
const todayIso = (now = new Date()) => pragueDate(now);

const requireText = (value: string | undefined, label: string) => {
  if (value !== undefined && !value.trim()) throw APIError.invalidArgument(`${label} is required`);
};
// A real calendar day: "2026-02-30" is refused (Date would roll it to 2 March).
export const isCalendarDate = (value: string) => {
  if (!DATE.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
};
const checkDate = (value: string | undefined, label: string) => {
  if (value && !isCalendarDate(value)) throw APIError.invalidArgument(`${label} must be a date (YYYY-MM-DD)`);
};

// ---------- Containers ----------

// Usable volume per equipment type, for fill rates (kept here for the reports; the capacities
// live with the container rules).
export { EQUIPMENT_CAPACITY_CBM } from "./containerRules";

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
  const out: WarehouseContainerInput = { ...input, ...(input.number !== undefined ? { number: input.number.trim().toUpperCase() } : {}) };
  for (const key of ["bookingNumber", "mblNumber", "vessel", "voyage", "plate"] as const) if (out[key] !== undefined) out[key] = out[key]!.trim();
  return out;
}

/** The container direction a position belongs in: výdej (import cargo) is stripped, příjem stuffed. */
const directionForVisit = (visit: string) => (visit === "výdej" ? "Unloading" : "Loading");

class WarehouseRecordsService {
  private async movementsById(companyId: string) {
    return new Map((await gateMovementRepository.listAll(companyId)).map((m) => [m.id, m]));
  }

  async listContainers(companyId: string) {
    return containerService.items(await containerRepository.listForCompany(companyId, 5000), companyId);
  }

  private async containerById(id: string, companyId: string) {
    return containerService.detail(id, companyId);
  }

  // The register form. With a position (`movementId`), the container is registered for it: the
  // position becomes its house (as before containers held many positions); a container with no
  // direction given takes the one the position belongs in.
  async createContainer(companyId: string, input: WarehouseContainerInput, userId = "") {
    if (!input.number?.trim()) throw APIError.invalidArgument("Container number is required");
    const movement = input.movementId ? await gateMovementRepository.findById(input.movementId, companyId) : null;
    if (input.movementId && !movement) throw APIError.invalidArgument("Position not found");
    const fields = containerFields(input);
    if (movement) {
      if (fields.direction === undefined) fields.direction = directionForVisit(movement.visit);
      await this.checkRegisterLink(companyId, fields.direction, movement);
    }
    const row = await containerRepository.createForCompany(companyId, fields as typeof warehouseContainerTable.$inferInsert);
    if (movement) await containerService.addPositions(row.id, companyId, userId, [movement.id], { fromRegister: true });
    return this.containerById(row.id, companyId);
  }

  // The register form's position becomes a house of the container: only the direction and the
  // one-container rule apply (the plan and tally screens check the rest).
  private async checkRegisterLink(companyId: string, direction: string, movement: GateMovementRow, exceptContainer?: string) {
    if (!directionFits(direction, movement.visit)) {
      throw APIError.invalidArgument(
        direction === "Loading" ? "This position is outgoing cargo (výdej) — it belongs in an import (Unloading) container" : "This position is inbound cargo (příjem) — it belongs in an export (Loading) container",
      );
    }
    const other = await containerPositionRepository.liveForMovement(db, movement.id, companyId);
    if (other && other.containerId !== exceptContainer) {
      const c = await containerRepository.findById(other.containerId, companyId);
      throw APIError.failedPrecondition(`This position is already in container ${c?.number ?? "another container"} — take it out there first`);
    }
  }

  async updateContainer(id: string, companyId: string, input: WarehouseContainerInput, userId = "", role = "user") {
    const stored = await containerRepository.findById(id, companyId);
    if (!stored) throw notFound("Container");
    const fields = containerFields(input);
    // The typed yard dates follow the container's stamps once there are stamps.
    if (fields.gatedIn !== undefined && stored.gateInAt && fields.gatedIn !== stored.gatedIn) {
      throw APIError.failedPrecondition("Gated in follows the container's gate-in stamp — a manager can void the stamp");
    }
    if (fields.gatedOut !== undefined && stored.gateOutAt && fields.gatedOut !== stored.gatedOut) {
      throw APIError.failedPrecondition("Gated out follows the container's gate-out stamp — a manager can void the stamp");
    }
    // Once the container is gated in, only its gate-out stamp takes it out (it checks the houses).
    if (fields.gatedOut !== undefined && stored.gateInAt && !stored.gateOutAt && fields.gatedOut !== stored.gatedOut) {
      throw APIError.failedPrecondition("The container is gated in — stamp its Container gate-out on the container page (Gated out follows that stamp)");
    }
    const relink = input.movementId !== undefined && (input.movementId || null) !== stored.movementId;
    const movement = relink && input.movementId ? await gateMovementRepository.findById(input.movementId, companyId) : null;
    if (relink && input.movementId && !movement) throw APIError.invalidArgument("Position not found");
    if (movement) await this.checkRegisterLink(companyId, fields.direction ?? stored.direction, movement, id);
    const houses = await containerPositionRepository.listForContainers([id], companyId);
    if (fields.direction !== undefined && fields.direction !== stored.direction && houses.length) {
      throw APIError.failedPrecondition("The direction cannot change while the container has positions — take them out first");
    }
    if (relink) {
      const old = houses.find((h) => h.movementId === stored.movementId);
      if (old && (old.stuffedAt || old.tallyOutcome)) throw APIError.failedPrecondition("The position is stuffed or tallied in this container — it stays");
      if (old) await containerService.removePosition(id, companyId, userId, old.movementId);
    }
    const row = await containerRepository.updateForCompany(id, companyId, fields);
    if (!row) throw notFound("Container");
    if (relink && movement) await containerService.addPositions(id, companyId, userId, [movement.id], { fromRegister: true });
    if (fields.plate !== undefined) await containerService.plateChanged(stored, fields.plate, companyId, userId, role);
    return this.containerById(id, companyId);
  }

  // Deleting a container takes its houses out (kept as history); refused once a house is stuffed
  // or tallied, or the container has stamps.
  async deleteContainer(id: string, companyId: string) {
    const blocked = await containerService.deleteBlocked(id, companyId);
    if (blocked) throw APIError.failedPrecondition(blocked);
    if (!(await containerRepository.softDeleteForCompany(id, companyId))) throw notFound("Container");
    const houses = await containerPositionRepository.listForContainers([id], companyId);
    await containerPositionRepository.softRemove(
      db,
      houses.map((h) => h.id),
      companyId,
    );
  }

  // ---------- Dock slots ----------
  // A slot books a dock door for a position (its gate movement): direction, reference, party and
  // vehicle come from the position. The same door is never booked twice for overlapping times —
  // the database refuses it (EXCLUDE constraint, migration 0016); the check before it only names
  // the clashing slot. Cancelled and Completed slots free the door.

  private slotItem = (s: SlotRow, movement?: GateMovementRow | null): WarehouseDockSlotItem => {
    const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, startsAt, endsAt, ...fields } = s;
    return {
      ...fields,
      warehouseTaskId: movement?.warehouseTaskId ?? null,
      positionRef: movement?.positionRef ?? "",
      customer: movement?.customer ?? "",
      visit: movement?.visit ?? "",
      startsAt: startsAt ? startsAt.toISOString() : null,
      endsAt: endsAt ? endsAt.toISOString() : null,
      end: slotEnd(s),
      ...stamps(s),
    };
  };

  // What a create (no `stored`) or an update writes: the input checked, merged with the stored
  // slot, the position's fields filled in and the start / end recomputed in Prague time.
  private async slotValues(companyId: string, input: WarehouseDockSlotInput, stored?: SlotRow) {
    checkDate(input.date, "Date");
    if (input.time !== undefined && !TIME.test(input.time)) throw APIError.invalidArgument("Time must be HH:MM");
    requireText(input.dock, "Dock");
    if (input.direction !== undefined && !["IN", "OUT"].includes(input.direction)) throw APIError.invalidArgument("Direction must be IN or OUT");
    if (input.status !== undefined && !(DOCK_SLOT_STATUSES as readonly string[]).includes(input.status)) {
      throw APIError.invalidArgument(`Status must be one of: ${DOCK_SLOT_STATUSES.join(", ")}`);
    }
    if (
      input.durationMin !== undefined &&
      (!Number.isInteger(input.durationMin) || input.durationMin < DOCK_SLOT_MIN_MIN || input.durationMin > DOCK_SLOT_MAX_MIN || input.durationMin % 15)
    ) {
      throw APIError.invalidArgument(`Duration must be ${DOCK_SLOT_MIN_MIN}–${DOCK_SLOT_MAX_MIN} minutes, in steps of 15`);
    }
    const { movementId: inputMovement, ...rest } = input;
    const values: Partial<typeof warehouseDockSlotTable.$inferInsert> = { ...rest };
    if (rest.dock !== undefined) values.dock = rest.dock.trim().replace(/\s+/g, " ");
    for (const key of ["reference", "party", "vehicle", "note"] as const) if (rest[key] !== undefined) values[key] = rest[key]!.trim();

    const movementId = inputMovement !== undefined ? inputMovement || null : (stored?.movementId ?? null);
    const relinked = movementId !== (stored?.movementId ?? null);
    if (!movementId && DOCK_SLOT_NEEDS_POSITION && (!stored || stored.movementId)) {
      throw APIError.invalidArgument("Pick the position this dock slot is for");
    }
    let movement: GateMovementRow | null = null;
    if (movementId) {
      // A new link must be a live position of this company; a kept link may be archived since.
      movement = relinked ? await gateMovementRepository.findById(movementId, companyId) : await gateMovementRepository.findByIdAny(movementId, companyId);
      if (!movement) throw APIError.invalidArgument("Position not found — it may be archived");
      values.direction = directionOfVisit(movement.visit);
      if (relinked) {
        values.reference ||= movement.positionRef || movement.gateRef;
        values.party ||= movement.customer;
        values.vehicle ||= movement.plate;
      }
    }
    values.movementId = movementId;

    const date = values.date ?? stored?.date ?? "";
    const time = values.time ?? stored?.time ?? "";
    const durationMin = values.durationMin ?? stored?.durationMin ?? DOCK_SLOT_DEFAULT_MIN;
    if (isCalendarDate(date) && TIME.test(time)) Object.assign(values, slotWindow(date, time, durationMin));
    return {
      values,
      dock: values.dock ?? stored?.dock ?? "",
      status: values.status ?? stored?.status ?? "Booked",
      startsAt: values.startsAt ?? stored?.startsAt ?? null,
      endsAt: values.endsAt ?? stored?.endsAt ?? null,
      movement,
    };
  }

  private async clashMessage(companyId: string, dock: string, startsAt: Date, endsAt: Date, exceptId?: string) {
    const o = await dockSlotRepository.findOverlap(companyId, dock, startsAt, endsAt, exceptId);
    if (!o) return null;
    return `${o.dock} is already booked ${o.time}–${slotEnd(o)} on ${o.date} for ${o.reference || "another booking"} — pick another time or door`;
  }

  // Runs the write; a clash with another slot (also one booked at the same moment, which only the
  // constraint sees) is a 409 naming that slot.
  private async writeSlot<T>(companyId: string, v: Awaited<ReturnType<typeof this.slotValues>>, exceptId: string | undefined, write: () => Promise<T>) {
    if (v.startsAt && v.endsAt && slotHoldsDock({ status: v.status })) {
      const clash = await this.clashMessage(companyId, v.dock, v.startsAt, v.endsAt, exceptId);
      if (clash) throw APIError.alreadyExists(clash);
    }
    try {
      return await write();
    } catch (err) {
      if (!isExclusionViolation(err)) throw err;
      const clash = v.startsAt && v.endsAt ? await this.clashMessage(companyId, v.dock, v.startsAt, v.endsAt, exceptId) : null;
      throw APIError.alreadyExists(clash ?? `${v.dock} is already booked at that time — pick another time or door`);
    }
  }

  async listDockSlots(companyId: string) {
    const [rows, movements] = await Promise.all([dockSlotRepository.listForCompany(companyId, 5000), this.movementsById(companyId)]);
    return rows.map((s) => this.slotItem(s, s.movementId ? movements.get(s.movementId) : undefined));
  }

  private async slotById(id: string, companyId: string) {
    const s = await dockSlotRepository.getByIdForCompany(id, companyId);
    if (!s) throw notFound("Dock slot");
    return this.slotItem(s, s.movementId ? await gateMovementRepository.findByIdAny(s.movementId, companyId) : null);
  }

  async createDockSlot(companyId: string, input: WarehouseDockSlotInput) {
    if (!input.date || !input.time || !input.dock?.trim()) throw APIError.invalidArgument("Date, time and dock are required");
    const v = await this.slotValues(companyId, input);
    const row = await this.writeSlot(companyId, v, undefined, () =>
      dockSlotRepository.createForCompany(companyId, v.values as Omit<typeof warehouseDockSlotTable.$inferInsert, "companyId">),
    );
    return this.slotById(row.id, companyId);
  }

  async updateDockSlot(id: string, companyId: string, input: WarehouseDockSlotInput) {
    const stored = await dockSlotRepository.getByIdForCompany(id, companyId);
    if (!stored) throw notFound("Dock slot");
    const v = await this.slotValues(companyId, input, stored);
    const row = await this.writeSlot(companyId, v, id, () => dockSlotRepository.updateForCompany(id, companyId, v.values));
    if (!row) throw notFound("Dock slot");
    return this.slotById(id, companyId);
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
    const [movements, containerRows, slots, health] = await Promise.all([
      gateMovementRepository.listAll(companyId),
      containerRepository.listForCompany(companyId, 5000),
      dockSlotRepository.listForCompany(companyId, 5000),
      shipmentOutboxRepository.health(companyId),
    ]);
    return buildReportSummary(movements, containerRows, slots, now, health);
  }
}

// ---------- report calculations (pure, exported for tests) ----------

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
// Received = gate-in (or load-in date); dispatched = gate-out (or the WH release stamp, or the
// gate-out of the container the cargo left in).
const receivedOn = (m: GateMovementRow) => isoDate(m.gateIn) || m.loadInDate;
// (Inbound cargo that left stuffed in a container: the container's gate-out.)
const dispatchedOn = (m: GateMovementRow) => isoDate(m.gateOut) || isoDate(m.impRelease) || isoDate(m.leftAt ?? null);
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

export function buildReportSummary(
  movements: GateMovementRow[],
  containers: ContainerRow[],
  slots: SlotRow[],
  now = new Date(),
  shipmentUpdates: ShipmentUpdateHealth = { pending: 0, failed: 0, blockedByFailed: 0, oldestPendingAt: null },
): WarehouseReportSummary {
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

  // Storage — cargo in the warehouse now, with the same clock as the gate job and positions.
  const running = movements.map((m) => movementStorage(m, now)).filter((s) => s.started && !s.stopped);
  const storage = {
    inWarehouse: running.length,
    expiring: running.filter((s) => s.state === "Expiring").length,
    chargeable: running.filter((s) => s.state === "Chargeable").length,
    estimatedCzk: running.reduce((a, s) => a + s.estimatedCzk, 0),
  };

  return { throughput, topCustomers, monthly, lanes, quality, storage, shipmentUpdates };
}

export const warehouseRecordsService = new WarehouseRecordsService();
