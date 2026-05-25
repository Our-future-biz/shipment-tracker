import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";

class WarehouseService {
  async listAll() {
    return warehouseTaskRepository.listAll();
  }

  async listByShipmentId(shipmentId: string) {
    return warehouseTaskRepository.listByShipmentId(shipmentId);
  }

  async create(taskId: string, shipmentId?: string) {
    return warehouseTaskRepository.create({ taskId, shipmentId });
  }

  async update(id: string, data: Record<string, unknown>) {
    return warehouseTaskRepository.update(id, data);
  }

  async softDelete(id: string) {
    return warehouseTaskRepository.softDelete(id);
  }

  // Warehouse sections
  async getSection(shipmentId: string, section: string) {
    return warehouseSectionRepository.findByShipmentAndSection(shipmentId, section);
  }

  async upsertSection(shipmentId: string, section: string, data: unknown) {
    return warehouseSectionRepository.upsert(shipmentId, section, data);
  }
}

export const warehouseService = new WarehouseService();
