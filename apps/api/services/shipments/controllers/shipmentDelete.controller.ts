import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface ShipmentDeleteRequest {
  shipmentId: string;
}

interface ShipmentDeleteResponse {
  ok: boolean;
}

// Soft-delete only — the row and all details are kept (deletedAt is set) so the
// job reference can never be reused. The actor is derived server-side from the
// authenticated user and recorded in the audit log.
export const shipmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId" },
  async (req: ShipmentDeleteRequest): Promise<ShipmentDeleteResponse> => {
    const userId = getAuthData()?.userID;
    await shipmentService.softDelete(req.shipmentId, userId);
    return { ok: true };
  },
);
