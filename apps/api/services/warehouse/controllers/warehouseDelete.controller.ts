import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";

interface WarehouseDeleteRequest {
  taskId: string;
}

interface WarehouseDeleteResponse {
  ok: boolean;
}

export const warehouseDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse/:taskId" },
  async (req: WarehouseDeleteRequest): Promise<WarehouseDeleteResponse> => {
    await warehouseService.softDelete(req.taskId, getAuthData()!.companyID);
    return { ok: true };
  },
);
