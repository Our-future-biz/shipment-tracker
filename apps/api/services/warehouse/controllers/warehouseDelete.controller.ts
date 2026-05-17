import { api } from "encore.dev/api";
import { warehouseService } from "../services/warehouse.service";

interface WarehouseDeleteRequest {
  taskId: string;
}

interface WarehouseDeleteResponse {
  ok: boolean;
}

export const warehouseDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/warehouse/:taskId" },
  async (req: WarehouseDeleteRequest): Promise<WarehouseDeleteResponse> => {
    await warehouseService.softDelete(req.taskId);
    return { ok: true };
  },
);
