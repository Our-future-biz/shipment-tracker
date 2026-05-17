import { api, APIError } from "encore.dev/api";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentUpdateRequest {
  shipmentId: string;
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
  hsCode?: string;
  cargoDescription?: string;
  incotermOrigin?: string;
  incotermDestination?: string;
}

interface ShipmentUpdateResponse {
  shipment: ShipmentItem;
}

export const shipmentUpdate = api(
  { expose: true, auth: false, method: "PATCH", path: "/shipments/:shipmentId" },
  async (req: ShipmentUpdateRequest): Promise<ShipmentUpdateResponse> => {
    const { shipmentId, ...data } = req;
    // TODO: get userId from auth context once auth is enforced
    const userId = "00000000-0000-0000-0000-000000000000";
    const shipment = await shipmentService.update(shipmentId, data, userId);
    if (!shipment) {
      throw APIError.notFound("Shipment not found");
    }
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
