import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseConceptTaskItem, WarehouseTaskPatch } from "../interfaces/interfaces";

interface WarehouseConceptUpdateRequest extends WarehouseTaskPatch {
  /** The task's id (UUID), not its WHCZ reference. */
  taskId: string;
}

interface WarehouseConceptUpdateResponse {
  task: WarehouseConceptTaskItem;
}

export const warehouseUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-concept/:taskId" },
  async ({ taskId, ...patch }: WarehouseConceptUpdateRequest): Promise<WarehouseConceptUpdateResponse> => {
    return { task: await warehouseService.update(taskId, getAuthData()!.companyID, patch) };
  },
);
