import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";

class TaskService {
  async list(shipmentId: string, companyId: string) {
    return shipmentTaskRepository.listByShipmentId(shipmentId, companyId);
  }

  async upsert(shipmentId: string, companyId: string, taskKey: string, completed: boolean, completedById?: string) {
    return shipmentTaskRepository.upsert(shipmentId, companyId, taskKey, completed, completedById);
  }
}

export const taskService = new TaskService();
