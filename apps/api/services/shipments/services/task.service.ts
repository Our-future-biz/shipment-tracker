import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";
import type { ShipmentTaskRecord } from "../schemas/shipmentTask.schema";
import { isoOrNull } from "../../../lib/db/serialize";
import type { TaskItem } from "../interfaces/interfaces";
import { shipmentService } from "./shipment.service";

const toItem = (r: ShipmentTaskRecord): TaskItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  taskKey: r.taskKey,
  completed: r.completed,
  completedAt: isoOrNull(r.completedAt),
  completedById: r.completedById,
});

class TaskService {
  async list(shipmentId: string, companyId: string): Promise<TaskItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    return (await shipmentTaskRepository.listByShipmentId(shipmentId, companyId)).map(toItem);
  }

  async upsert(shipmentId: string, companyId: string, taskKey: string, completed: boolean, completedById: string): Promise<TaskItem> {
    await shipmentService.requireLive(shipmentId, companyId);
    return toItem(await shipmentTaskRepository.upsert(shipmentId, companyId, taskKey, completed, completedById));
  }
}

export const taskService = new TaskService();
