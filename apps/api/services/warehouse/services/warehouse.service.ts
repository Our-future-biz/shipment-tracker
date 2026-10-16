import { APIError } from "encore.dev/api";
import { iso } from "../../../lib/db/serialize";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
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

  async upsertSection(shipmentId: string, section: string, companyId: string, data: unknown): Promise<WarehouseSectionItem> {
    const known = toSection(section);
    const existing = await warehouseSectionRepository.findByShipmentAndSection(shipmentId, known, companyId);
    if (!existing) await assertShipmentExists(shipmentId);
    return toSectionItem(await warehouseSectionRepository.upsert(shipmentId, known, companyId, data));
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
