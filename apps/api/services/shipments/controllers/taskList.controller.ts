import { api } from "encore.dev/api";
import { taskService } from "../services/task.service";
import type { TaskItem } from "../interfaces/interfaces";

interface TaskListRequest {
  shipmentId: string;
}

interface TaskListResponse {
  tasks: TaskItem[];
}

export const taskList = api(
  { expose: true, auth: false, method: "GET", path: "/shipments/:shipmentId/tasks" },
  async (req: TaskListRequest): Promise<TaskListResponse> => {
    const tasks = await taskService.list(req.shipmentId);
    return { tasks: tasks as unknown as TaskItem[] };
  },
);
