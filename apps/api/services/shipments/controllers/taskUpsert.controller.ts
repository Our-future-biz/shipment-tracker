import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { taskService } from "../services/task.service";
import type { TaskItem } from "../interfaces/interfaces";

interface TaskUpsertRequest {
  shipmentId: string;
  taskKey: string;
  completed: boolean;
}

interface TaskUpsertResponse {
  task: TaskItem;
}

export const taskUpsert = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tasks" },
  async (req: TaskUpsertRequest): Promise<TaskUpsertResponse> => {
    if (!req.taskKey) {
      throw APIError.invalidArgument("taskKey is required");
    }
    const auth = getAuthData()!;
    const task = await taskService.upsert(req.shipmentId, auth.companyID, req.taskKey, req.completed, auth.userID);
    return { task: task as unknown as TaskItem };
  },
);
