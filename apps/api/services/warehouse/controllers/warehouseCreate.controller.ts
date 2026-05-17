import { api, APIError } from "encore.dev/api";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseTaskItem } from "../interfaces/interfaces";

interface WarehouseCreateRequest {
  taskId: string;
  shipmentId?: string;
}

interface WarehouseCreateResponse {
  task: WarehouseTaskItem;
}

export const warehouseCreate = api(
  { expose: true, auth: false, method: "POST", path: "/warehouse" },
  async (req: WarehouseCreateRequest): Promise<WarehouseCreateResponse> => {
    if (!req.taskId) {
      throw APIError.invalidArgument("taskId is required");
    }
    const task = await warehouseService.create(req.taskId, req.shipmentId);
    return { task: task as unknown as WarehouseTaskItem };
  },
);
