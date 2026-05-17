import { api, APIError } from "encore.dev/api";
import { taskService } from "../services/task.service";
import type { TaskItem } from "../interfaces/interfaces";

interface TaskUpsertRequest {
  shipmentId: string;
  taskKey: string;
  completed: boolean;
  completedById?: string;
}

interface TaskUpsertResponse {
  task: TaskItem;
}

export const taskUpsert = api(
  { expose: true, auth: false, method: "POST", path: "/shipments/:shipmentId/tasks" },
  async (req: TaskUpsertRequest): Promise<TaskUpsertResponse> => {
    if (!req.taskKey) {
      throw APIError.invalidArgument("taskKey is required");
    }
    const task = await taskService.upsert(req.shipmentId, req.taskKey, req.completed, req.completedById);
    return { task: task as unknown as TaskItem };
  },
);
