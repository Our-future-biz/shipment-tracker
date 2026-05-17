import { api, APIError } from "encore.dev/api";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentCreateRequest {
  jobNumber: string;
  shipper?: string;
  consignee?: string;
  pol?: string;
  pod?: string;
  destination?: string;
  tradeDirection?: string;
  loadType?: string;
  status?: string;
  customsStatus?: string;
  vessel?: string;
  voyage?: string;
  shippingLine?: string;
  bookingNumber?: string;
  containerNumber?: string;
  personalReference?: string;
  agent?: string;
}

interface ShipmentCreateResponse {
  shipment: ShipmentItem;
}

export const shipmentCreate = api(
  { expose: true, auth: false, method: "POST", path: "/shipments" },
  async (req: ShipmentCreateRequest): Promise<ShipmentCreateResponse> => {
    if (!req.jobNumber) {
      throw APIError.invalidArgument("jobNumber is required");
    }
    const shipment = await shipmentService.create(req);
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
