import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
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
    const actor = requireRole("superadmin", "admin", "manager");
    await warehouseService.softDelete(req.taskId, actor.companyID);
    return { ok: true };
  },
);
