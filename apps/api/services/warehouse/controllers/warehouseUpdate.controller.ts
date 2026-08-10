import { api, APIError } from "encore.dev/api";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseTaskItem } from "../interfaces/interfaces";

interface WarehouseUpdateRequest {
  taskId: string;
  type?: string;
  priority?: string;
  status?: string;
  assignee?: string;
  dueDate?: string;
  cargo?: string;
  weight?: string;
  notes?: string;
  data?: unknown;
}

interface WarehouseUpdateResponse {
  task: WarehouseTaskItem;
}

export const warehouseUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse/:taskId" },
  async (req: WarehouseUpdateRequest): Promise<WarehouseUpdateResponse> => {
    // The client sends the task's UUID as the :taskId path param; update by it.
    const { taskId, ...data } = req;
    const task = await warehouseService.update(taskId, data);
    if (!task) {
      throw APIError.notFound("Warehouse task not found");
    }
    return { task: task as unknown as WarehouseTaskItem };
  },
);
