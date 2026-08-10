import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentListRequest {
  limit?: number;
  offset?: number;
  sortDirection?: "asc" | "desc";
  customerId?: string;
  // Server-side filtering.
  status?: string;
  /** Coarse UI status bucket: active | in-transit | customs | delivered */
  statusBucket?: string;
  search?: string;
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
  { expose: true, auth: true, method: "GET", path: "/shipments" },
  async (req: ShipmentListRequest): Promise<ShipmentListResponse> => {
    const result = await shipmentService.list(getAuthData()!.companyID, {
      customerId: req.customerId,
      status: req.status,
      statusBucket: req.statusBucket,
      search: req.search,
      limit: Math.min(req.limit ?? 100, 200),
      offset: req.offset ?? 0,
      sortDirection: req.sortDirection ?? "desc",
    });
    return result as unknown as ShipmentListResponse;
  },
);
