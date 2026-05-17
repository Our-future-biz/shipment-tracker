import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";

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
}

export const warehouseService = new WarehouseService();
