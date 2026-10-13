import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteLinksService } from "../services/quoteLinks.service";
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
  /** Overview tile filter: active | attention | import | export | week | nextweek */
  tile?: string;
  /** Warehouse page filter: in | stock | out */
  warehouse?: string;
  /** Customs page filter: urgent */
  customs?: string;
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
    const companyId = getAuthData()!.companyID;
    // The one place every user passes regularly: the links between quotes and shipments are
    // compared here when that is due - at most once an hour unless something needs repair.
    await quoteLinksService.ensureQuoteLinksSynced(companyId);
    const result = await shipmentService.list(companyId, {
      customerId: req.customerId,
      status: req.status,
      statusBucket: req.statusBucket,
      tile: req.tile,
      warehouse: req.warehouse,
      customs: req.customs,
      search: req.search,
      limit: Math.min(req.limit ?? 100, 200),
      offset: req.offset ?? 0,
      sortDirection: req.sortDirection ?? "desc",
    });
    return result as unknown as ShipmentListResponse;
  },
);
