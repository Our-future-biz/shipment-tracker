import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { warehouseConcept } from "~encore/clients";
import { iso } from "../../../lib/db/serialize";
import { businessDay } from "../../../lib/businessDate";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { cargoNum, dimensionVolumePerPiece } from "../../../lib/cargoVolume";
import { tellOperations, type RemeasuredFigures } from "../../../lib/operationsNotice";
import { isUuid } from "../../../lib/uuid";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository, type SectionKeyWrite } from "../repositories/warehouseSection.repository";
import type { NewWarehouseTaskRecord, WarehouseTaskRecord } from "../schemas/warehouseTask.schema";
import type { WarehouseSectionRecord } from "../schemas/warehouseSection.schema";
import {
  WAREHOUSE_SECTIONS,
  type WarehouseRef,
  type WarehouseSection,
  type WarehouseSectionItem,
  type WarehouseTaskItem,
  type WarehouseTaskPatch,
} from "../interfaces/interfaces";

// The year of a reference is Prague's (23:30 UTC on 31 December is already the next year there).
const pragueYear = (now: Date) => businessDay(now).slice(0, 4);

// The jobs among these whose live pick-up is the Warehouse Concept's, with the Concept's plate
// ("" when it has none). When the Concept doesn't answer, none: the plates stay this pick-up's.
async function conceptPlates(shipmentIds: string[], companyId: string): Promise<Map<string, string>> {
  try {
    const { jobs } = await warehouseConcept._internalConceptPickupPlates({ companyId, shipmentIds });
    return new Map(jobs.map((j) => [j.shipmentId, j.licensePlate]));
  } catch (err) {
    log.warn(err, "Warehouse Concept pick-up plates not read");
    return new Map();
  }
}

const toTaskItem = (r: WarehouseTaskRecord): WarehouseTaskItem => ({
  id: r.id,
  taskId: r.taskId,
  shipmentId: r.shipmentId,
  type: r.type,
  priority: r.priority,
  status: r.status,
  assignee: r.assignee,
  dueDate: r.dueDate,
  cargo: r.cargo,
  weight: r.weight,
  notes: r.notes,
  data: r.data,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

const toSectionItem = (r: WarehouseSectionRecord): WarehouseSectionItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  section: r.section,
  data: r.data,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Shipment Details ("job") is saved field by field (patchSection): a save of the notes can never
// take back the remeasured lines saved meanwhile, nor the other way round. The fields it holds and
// the longest text each may be. When Operations were informed is the server's: only Inform
// Operations writes it (informOperations), which also tells them in the shipment's chat.
const JOB_KEYS: Record<string, number> = {
  notes: 10_000,
  vgm_sent: 2_000,
  survey_sent: 2_000,
  remeasurement_sent: 2_000,
  remeasure_rows: 100_000,
  // The Colli, weight and volume of the shipment's own House B/L, as Document Reading read it (owner's answer
  // 22 Nov): JSON { houseBol, colli, weightKg, volumeCbm, readAt }, nothing else (checkHouseBlFigures). Shown beside the warehouse's remeasured
  // figures as "Bill Of Lading Details", never one of them.
  house_bl_figures: 2_000,
};
const KEYED_SECTIONS: readonly string[] = ["job"];
const MAX_KEYS_PER_SAVE = 10;
const MAX_REMEASURE_ROWS = 200;
const FIELD_LABELS: Record<string, string> = {
  notes: "notes",
  vgm_sent: "VGM sent",
  survey_sent: "survey sent",
  remeasurement_sent: "remeasurement sent",
  remeasure_rows: "remeasured lines",
  house_bl_figures: "Bill Of Lading details",
  inform_operations_sent: "operations informed",
};

function checkChanges(section: string, changes: SectionKeyWrite[]) {
  if (!KEYED_SECTIONS.includes(section)) throw APIError.invalidArgument(`The ${section} section is saved whole, not field by field`);
  if (!Array.isArray(changes) || !changes.length || changes.length > MAX_KEYS_PER_SAVE) {
    throw APIError.invalidArgument(`Send 1 to ${MAX_KEYS_PER_SAVE} changed fields`);
  }
  if (new Set(changes.map((c) => c.key)).size !== changes.length) throw APIError.invalidArgument("Each field may be sent once per save");
  for (const c of changes) {
    const max = JOB_KEYS[c.key];
    if (max === undefined) throw APIError.invalidArgument(`Unknown field "${c.key}" for Shipment Details`);
    if (typeof c.value !== "string" || (c.expected !== undefined && typeof c.expected !== "string")) throw APIError.invalidArgument(`${c.key}: value and expected must be text`);
    if (c.value.length > max) throw APIError.invalidArgument(`${FIELD_LABELS[c.key] ?? c.key} is too long (at most ${max} characters)`);
    if (c.key === "remeasure_rows" && c.value) {
      let rows: unknown;
      try {
        rows = JSON.parse(c.value);
      } catch {
        throw APIError.invalidArgument("Remeasured lines must be a JSON list");
      }
      if (!Array.isArray(rows) || rows.length > MAX_REMEASURE_ROWS || rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) {
        throw APIError.invalidArgument(`Remeasured lines must be a list of up to ${MAX_REMEASURE_ROWS} lines`);
      }
    }
    if (c.key === "house_bl_figures" && c.value) checkHouseBlFigures(c.value);
  }
}

// The keys of the House B/L's figures, as Document Reading writes them (apps/web documents/_components
// DocumentReadingWorkflow writeBlDetails): the House B/L they are of, its Colli, kg and m³, and when it was read.
const HOUSE_BL_KEYS = ["houseBol", "colli", "weightKg", "volumeCbm", "readAt"] as const;

/**
 * The House B/L's figures are taken only as Document Reading writes them (review of system-23): an object of
 * exactly HOUSE_BL_KEYS - a House B/L, three numbers of 0 or more and the time it was read. Anyone who may patch
 * Shipment Details could store any object, which Cargo Details and the Warehouse tab then read as the B/L's.
 */
function checkHouseBlFigures(value: string) {
  let figures: unknown;
  try {
    figures = JSON.parse(value);
  } catch {
    figures = null;
  }
  const o = figures && typeof figures === "object" && !Array.isArray(figures) ? (figures as Record<string, unknown>) : null;
  const keys = o ? Object.keys(o) : [];
  const figure = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const asWritten =
    !!o &&
    keys.length === HOUSE_BL_KEYS.length &&
    HOUSE_BL_KEYS.every((k) => keys.includes(k)) &&
    figure(o.colli) &&
    figure(o.weightKg) &&
    figure(o.volumeCbm) &&
    typeof o.houseBol === "string" &&
    !!o.houseBol.trim() &&
    typeof o.readAt === "string" &&
    !Number.isNaN(Date.parse(o.readAt));
  if (!asWritten) {
    throw APIError.invalidArgument(
      "Bill Of Lading details must be { houseBol, colli, weightKg, volumeCbm, readAt }: the House B/L, its Colli, kg and CBM as numbers of 0 or more, and when it was read",
    );
  }
}

function settled(res: { row: WarehouseSectionRecord; conflicts: null } | { row: null; conflicts: string[] }): WarehouseSectionRecord {
  if (res.row) return res.row;
  const fields = res.conflicts.map((k) => FIELD_LABELS[k] ?? k).join(", ");
  throw APIError.aborted(`Changed meanwhile: ${fields} — someone else saved this. Reload to see the latest and save again.`);
}

/**
 * The totals of the remeasured lines as saved (Shipments → Warehouse): pieces, pieces × kg per
 * piece and pieces × L × W × H - the numbers read as that screen reads them.
 */
export function remeasuredFigures(raw: unknown): RemeasuredFigures {
  let list: unknown = [];
  try {
    list = typeof raw === "string" && raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  let colli = 0;
  let kg = 0;
  let m3 = 0;
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    const text = (k: string) => (typeof o[k] === "string" || typeof o[k] === "number" ? String(o[k]) : "");
    const pieces = cargoNum(text("pieces"));
    colli += pieces;
    kg += pieces * cargoNum(text("weightPerPcKg"));
    m3 += pieces * dimensionVolumePerPiece({ lengthCm: text("lengthCm"), widthCm: text("widthCm"), heightCm: text("heightCm"), volumePerPcM3: "" });
  }
  return { colli, weightKg: Math.round(kg * 10) / 10, volumeCbm: Math.round(m3 * 1000) / 1000 };
}

// A path parameter can't be typed as a union in Encore, so the section is checked here.
/**
 * The license plates of a stored Pick-up section, each once, as one text: a pick-up can have
 * several rows. "" when there are none or the stored rows are unreadable.
 */
export function pickupLicensePlates(data: unknown): string {
  const stored = data && typeof data === "object" ? (data as { rows?: unknown }).rows : undefined;
  let rows: unknown = stored;
  if (typeof stored === "string") {
    try {
      rows = JSON.parse(stored);
    } catch {
      return "";
    }
  }
  if (!Array.isArray(rows)) return "";
  const plates = rows.map((r: { licensePlate?: unknown } | null) => (typeof r?.licensePlate === "string" ? r.licensePlate.trim() : ""));
  return [...new Set(plates.filter(Boolean))].join(", ");
}

export function toSection(section: string): WarehouseSection {
  const found = WAREHOUSE_SECTIONS.find((s) => s === section);
  if (!found) throw APIError.invalidArgument(`Unknown section; use one of: ${WAREHOUSE_SECTIONS.join(", ")}`);
  return found;
}

// The fields a task update carries, ready for the table; undefined ones are left as they are.
export function taskChanges(patch: WarehouseTaskPatch): Partial<NewWarehouseTaskRecord> {
  const { dueDate, ...rest } = patch;
  const out: Partial<NewWarehouseTaskRecord> = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  if (dueDate !== undefined) {
    const d = dueDate.trim();
    if (d && !DATE.test(d)) throw APIError.invalidArgument("dueDate must be a date (yyyy-mm-dd)");
    out.dueDate = d || null;
  }
  return out;
}

class WarehouseService {
  async listAll(companyId: string): Promise<WarehouseTaskItem[]> {
    return (await warehouseTaskRepository.listAll(companyId)).map(toTaskItem);
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<WarehouseTaskItem[]> {
    return (await warehouseTaskRepository.listByShipmentId(shipmentId, companyId)).map(toTaskItem);
  }

  /**
   * Warehouse references are WHCZ + the Prague calendar year + a per-company sequence (as the
   * Warehouse Concept's WCZ references: the server's own year turned an hour late, or early). A
   * shipment that has none yet is checked with the shipments service before it gets one.
   */
  async ensureForShipments(companyId: string, shipmentIds: string[], now = new Date()): Promise<WarehouseRef[]> {
    const prefix = `WHCZ${pragueYear(now)}`;
    const out: WarehouseRef[] = [];
    for (const shipmentId of new Set(shipmentIds)) {
      const existing = await warehouseTaskRepository.findForShipment(companyId, shipmentId);
      if (!existing) await assertShipmentExists(shipmentId);
      const task = existing ?? (await warehouseTaskRepository.ensureForShipment(companyId, shipmentId, prefix));
      out.push({ shipmentId, reference: task.taskId });
    }
    return out;
  }

  /** Truck references are TCZ + the Prague calendar year + a per-company sequence. */
  async createTruck(companyId: string, now = new Date()): Promise<string> {
    const truck = await warehouseTaskRepository.createTruck(companyId, `TCZ${pragueYear(now)}`);
    return truck.taskId;
  }

  async create(companyId: string, taskId: string, shipmentId?: string): Promise<WarehouseTaskItem> {
    if (shipmentId) await assertShipmentExists(shipmentId);
    return toTaskItem(await warehouseTaskRepository.createForCompany(companyId, { taskId, shipmentId: shipmentId ?? null }));
  }

  async update(id: string, companyId: string, patch: WarehouseTaskPatch): Promise<WarehouseTaskItem> {
    const task = await warehouseTaskRepository.updateForCompany(id, companyId, taskChanges(patch));
    if (!task) throw APIError.notFound("Warehouse task not found");
    return toTaskItem(task);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    const task = await warehouseTaskRepository.softDeleteForCompany(id, companyId);
    if (!task) throw APIError.notFound("Warehouse task not found");
  }

  // Warehouse sections
  async getSection(shipmentId: string, section: string, companyId: string): Promise<WarehouseSectionItem | null> {
    const row = await warehouseSectionRepository.findByShipmentAndSection(shipmentId, toSection(section), companyId);
    return row ? toSectionItem(row) : null;
  }

  /**
   * The Pick-up license plates of these shipments; a shipment with none is left out. A job whose
   * live pick-up is the Warehouse Concept's (it has a Concept position, owner decision Q17) takes the
   * Concept's plate - the plate it left with at the WH release, else the Concept pick-up's - and not
   * this pick-up, view only and stale on such a job (mock council C2). When the Concept has no plate
   * for it, it is left out, so Shipments shows its own plate number. When the Concept doesn't
   * answer, every job keeps this pick-up's plates, as before.
   *
   * Only for a caller who sees the Concept (`seesConcepts`, superadmins today): Trucking's hub trips
   * put Concept positions on live jobs, and everyone else keeps the normal, editable pick-up until
   * the Concept opens (owner decision R25), so they keep its plates too (mock council review of C2).
   */
  async pickupPlates(shipmentIds: string[], companyId: string, seesConcepts = false): Promise<{ shipmentId: string; licensePlate: string }[]> {
    if (shipmentIds.length === 0) return [];
    const [rows, concept] = await Promise.all([
      warehouseSectionRepository.findManyBySection(shipmentIds, "pickup", companyId),
      seesConcepts ? conceptPlates(shipmentIds, companyId) : new Map<string, string>(),
    ]);
    const basic = rows.filter((r) => !concept.has(r.shipmentId)).map((r) => ({ shipmentId: r.shipmentId, licensePlate: pickupLicensePlates(r.data) }));
    return [...basic, ...[...concept].map(([shipmentId, licensePlate]) => ({ shipmentId, licensePlate }))].filter((p) => p.licensePlate);
  }

  // A whole-section save (Pick-up). Shipment Details is saved field by field (patchSection): a
  // whole save of it from a page opened before would take back what others saved since.
  async upsertSection(shipmentId: string, section: string, companyId: string, data: unknown): Promise<WarehouseSectionItem> {
    const known = toSection(section);
    if (KEYED_SECTIONS.includes(known)) throw APIError.failedPrecondition("Shipment Details are saved field by field — reload the page and save again");
    const existing = await warehouseSectionRepository.findByShipmentAndSection(shipmentId, known, companyId);
    if (!existing) await assertShipmentExists(shipmentId);
    return toSectionItem(await warehouseSectionRepository.upsert(shipmentId, known, companyId, data));
  }

  /** Saves only the listed fields of a section (Shipment Details); a field changed since the client read it is refused. */
  async patchSection(shipmentId: string, section: string, companyId: string, changes: SectionKeyWrite[]): Promise<WarehouseSectionItem> {
    const known = toSection(section);
    checkChanges(known, changes);
    if (!isUuid(shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    // The shipment's first section: it must be a live shipment of the caller's company.
    if (!(await warehouseSectionRepository.findByShipmentAndSection(shipmentId, known, companyId))) await assertShipmentExists(shipmentId);
    return toSectionItem(settled(await warehouseSectionRepository.patchKeys(shipmentId, known, companyId, changes)));
  }

  /**
   * Inform Operations (Shipments → Warehouse): records when, and tells the shipment's people in its
   * chat - "Cargo has been remeasured by the warehouse", the shipment's figures against the saved
   * remeasured lines, tagging its Person in Charge and Holiday Cover. Both in one transaction: a
   * notice that could not be posted records nothing (an error), so the time never says Operations
   * were told when they were not. `expected` is the time the client saw ("" = never): a second click
   * of a double click, or a stale page, is refused rather than posting the notice twice. Answers
   * who was tagged.
   */
  async informOperations(shipmentId: string, companyId: string, expected: string): Promise<{ section: WarehouseSectionItem; tagged: string[] }> {
    if (!isUuid(shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    if (typeof expected !== "string") throw APIError.invalidArgument("expected must be text");
    let tagged: string[] = [];
    const res = await warehouseSectionRepository.patchKeys(
      shipmentId,
      "job",
      companyId,
      [{ key: "inform_operations_sent", value: new Date().toISOString(), expected }],
      async (_tx, row) => {
        const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
        const remeasured = remeasuredFigures(data.remeasure_rows);
        if (!remeasured.colli && !remeasured.weightKg && !remeasured.volumeCbm) {
          throw APIError.failedPrecondition("No remeasured lines are saved — save the lines first");
        }
        // Compared, as the screen does, with the totals of the shipment's cargo dimension lines.
        tagged = await tellOperations(shipmentId, remeasured, "dimensions", "warehouse");
      },
    );
    return { section: toSectionItem(settled(res)), tagged };
  }

  /** A deleted shipment's warehouse task and sections are retired with it. */
  async retireShipment(shipmentId: string, companyId: string): Promise<void> {
    await Promise.all([
      warehouseTaskRepository.softDeleteForShipment(shipmentId, companyId),
      warehouseSectionRepository.softDeleteForShipment(shipmentId, companyId),
    ]);
  }
}

export const warehouseService = new WarehouseService();
