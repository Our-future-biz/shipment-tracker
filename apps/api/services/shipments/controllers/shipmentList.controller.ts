import { api } from "encore.dev/api";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentListRequest {
  limit?: number;
  offset?: number;
  sortDirection?: "asc" | "desc";
  customerId?: string;
}

interface ShipmentListResponse {
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
  data: ShipmentItem[];
}

export const shipmentList = api(
  { expose: true, auth: false, method: "GET", path: "/shipments" },
  async (req: ShipmentListRequest): Promise<ShipmentListResponse> => {
    return shipmentService.list(req, { customerId: req.customerId }) as unknown as Promise<ShipmentListResponse>;
  },
);
