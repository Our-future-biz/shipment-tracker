import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentGetRequest {
  shipmentId: string;
}

interface ShipmentGetResponse {
  shipment: ShipmentItem;
}

export const shipmentGet = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId" },
  async (req: ShipmentGetRequest): Promise<ShipmentGetResponse> => {
    return { shipment: await shipmentService.get(req.shipmentId, getAuthData()!.companyID) };
  },
);
