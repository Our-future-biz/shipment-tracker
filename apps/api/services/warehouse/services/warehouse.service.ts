import { APIError } from "encore.dev/api";
import { iso } from "../../../lib/db/serialize";
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
   * Warehouse references are WHCZ + the calendar year + a per-company sequence. A shipment that
   * has none yet is checked with the shipments service before it gets one.
   */
  async ensureForShipments(companyId: string, shipmentIds: string[], now = new Date()): Promise<WarehouseRef[]> {
    const prefix = `WHCZ${now.getFullYear()}`;
    const out: WarehouseRef[] = [];
    for (const shipmentId of new Set(shipmentIds)) {
      const existing = await warehouseTaskRepository.findForShipment(companyId, shipmentId);
      if (!existing) await assertShipmentExists(shipmentId);
      const task = existing ?? (await warehouseTaskRepository.ensureForShipment(companyId, shipmentId, prefix));
      out.push({ shipmentId, reference: task.taskId });
    }
    return out;
  }

  /** Truck references are TCZ + the calendar year + a per-company sequence. */
  async createTruck(companyId: string, now = new Date()): Promise<string> {
    const truck = await warehouseTaskRepository.createTruck(companyId, `TCZ${now.getFullYear()}`);
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
        tagged = await tellOperations(shipmentId, remeasured, "dimensions");
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
