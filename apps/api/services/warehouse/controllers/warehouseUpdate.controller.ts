import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseTaskItem, WarehouseTaskPatch } from "../interfaces/interfaces";

interface WarehouseUpdateRequest extends WarehouseTaskPatch {
  /** The task's id (UUID), not its WHCZ reference. */
  taskId: string;
}

interface WarehouseUpdateResponse {
  task: WarehouseTaskItem;
}

export const warehouseUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse/:taskId" },
  async ({ taskId, ...patch }: WarehouseUpdateRequest): Promise<WarehouseUpdateResponse> => {
    return { task: await warehouseService.update(taskId, getAuthData()!.companyID, patch) };
  },
);
