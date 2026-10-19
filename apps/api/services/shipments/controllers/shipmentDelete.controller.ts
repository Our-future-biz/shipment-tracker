import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { shipmentService } from "../services/shipment.service";

interface ShipmentDeleteRequest {
  shipmentId: string;
}

interface ShipmentDeleteResponse {
  ok: boolean;
}

// Soft-delete only — the row and all details are kept (deletedAt is set) so the
// job reference can never be reused. The actor is derived server-side from the
// authenticated user and recorded in the audit log. Managers and up only: the delete
// also retires the shipment's costs, billing and links in the other services.
export const shipmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId" },
  async (req: ShipmentDeleteRequest): Promise<ShipmentDeleteResponse> => {
    const auth = requireRole("superadmin", "admin", "manager");
    await shipmentService.softDelete(req.shipmentId, auth.companyID, auth.userID);
    return { ok: true };
  },
);
