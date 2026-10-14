import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import { gateMovementService } from "../services/gateMovement.service";

interface WarehouseDeleteRequest {
  taskId: string;
}

interface WarehouseDeleteResponse {
  ok: boolean;
}

export const warehouseDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse/:taskId" },
  async (req: WarehouseDeleteRequest): Promise<WarehouseDeleteResponse> => {
    const companyId = getAuthData()!.companyID;
    await warehouseService.softDelete(req.taskId, companyId);
    // Its gate row goes too, unless the gate already acted on it (that record is evidence).
    await gateMovementService.removeForTask(req.taskId, companyId);
    return { ok: true };
  },
);
