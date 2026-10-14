import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { taskService } from "../services/task.service";
import type { TaskItem } from "../interfaces/interfaces";

interface TaskUpsertRequest {
  shipmentId: string;
  taskKey: string & MinLen<1>;
  completed: boolean;
}

interface TaskUpsertResponse {
  task: TaskItem;
}

export const taskUpsert = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tasks" },
  async (req: TaskUpsertRequest): Promise<TaskUpsertResponse> => {
    const auth = getAuthData()!;
    return { task: await taskService.upsert(req.shipmentId, auth.companyID, req.taskKey, req.completed, auth.userID) };
  },
);
