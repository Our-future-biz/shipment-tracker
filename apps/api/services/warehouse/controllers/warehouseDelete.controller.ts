import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { gateAdminService } from "../services/gateAdmin.service";
import { requireModule } from "../../../lib/modules";

interface WarehouseDeleteRequest {
  taskId: string;
}

interface WarehouseDeleteResponse {
  ok: boolean;
}

// Removes a position the gate never stamped; its gate records are archived with it (kept).
// A position whose gate record has stamps needs a manager and a reason: warehousePositionRemove.
export const warehouseDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse/:taskId" },
  async (req: WarehouseDeleteRequest): Promise<WarehouseDeleteResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = getAuthData()!;
    await gateAdminService.removePosition(req.taskId, companyID, userID, role);
    return { ok: true };
  },
);

interface WarehousePositionRemoveRequest {
  taskId: string;
  /** Required when the position's gate record has stamps (manager only). Sent in the body, so it stays out of URLs and logs. */
  reason?: string;
}

// Removes a position from the warehouse, with an optional reason; its gate records are archived
// with it (kept, with the reason). A position whose gate record has stamps is removed only by a
// manager with a reason.
export const warehousePositionRemove = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-positions/:taskId/remove" },
  async (req: WarehousePositionRemoveRequest): Promise<WarehouseDeleteResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = getAuthData()!;
    await gateAdminService.removePosition(req.taskId, companyID, userID, role, req.reason);
    return { ok: true };
  },
);
