import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";

class WarehouseService {
  async listAll(companyId: string) {
    return warehouseTaskRepository.listAll(companyId);
  }

  async listByShipmentId(shipmentId: string, companyId: string) {
    return warehouseTaskRepository.listByShipmentId(shipmentId, companyId);
  }

  /** Warehouse references are WHCZ + the calendar year + a per-company sequence. */
  async ensureForShipments(companyId: string, shipmentIds: string[], now = new Date()) {
    const prefix = `WHCZ${now.getFullYear()}`;
    const out: { shipmentId: string; reference: string }[] = [];
    for (const shipmentId of shipmentIds) {
      const task = await warehouseTaskRepository.ensureForShipment(companyId, shipmentId, prefix);
      out.push({ shipmentId, reference: task.taskId });
    }
    return out;
  }

  async create(companyId: string, taskId: string, shipmentId?: string) {
    return warehouseTaskRepository.create({ companyId, taskId, shipmentId });
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    return warehouseTaskRepository.update(id, companyId, data);
  }

  async softDelete(id: string, companyId: string) {
    return warehouseTaskRepository.softDelete(id, companyId);
  }

  // Warehouse sections
  async getSection(shipmentId: string, section: string, companyId: string) {
    return warehouseSectionRepository.findByShipmentAndSection(shipmentId, section, companyId);
  }

  async upsertSection(shipmentId: string, section: string, companyId: string, data: unknown) {
    return warehouseSectionRepository.upsert(shipmentId, section, companyId, data);
  }
}

export const warehouseService = new WarehouseService();
