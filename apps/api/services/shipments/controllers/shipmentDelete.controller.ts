import { api } from "encore.dev/api";
import { shipmentService } from "../services/shipment.service";

interface ShipmentDeleteRequest {
  shipmentId: string;
}

interface ShipmentDeleteResponse {
  ok: boolean;
}

export const shipmentDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/shipments/:shipmentId" },
  async (req: ShipmentDeleteRequest): Promise<ShipmentDeleteResponse> => {
    await shipmentService.softDelete(req.shipmentId);
    return { ok: true };
  },
);
