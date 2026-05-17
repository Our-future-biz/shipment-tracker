import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";

class TaskService {
  async list(shipmentId: string) {
    return shipmentTaskRepository.listByShipmentId(shipmentId);
  }

  async upsert(shipmentId: string, taskKey: string, completed: boolean, completedById?: string) {
    return shipmentTaskRepository.upsert(shipmentId, taskKey, completed, completedById);
  }
}

export const taskService = new TaskService();
