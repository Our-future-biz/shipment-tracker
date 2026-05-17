import { api, APIError } from "encore.dev/api";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentGetRequest {
  shipmentId: string;
}

interface ShipmentGetResponse {
  shipment: ShipmentItem;
}

export const shipmentGet = api(
  { expose: true, auth: false, method: "GET", path: "/shipments/:shipmentId" },
  async (req: ShipmentGetRequest): Promise<ShipmentGetResponse> => {
    const shipment = await shipmentService.getById(req.shipmentId);
    if (!shipment) {
      throw APIError.notFound("Shipment not found");
    }
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
