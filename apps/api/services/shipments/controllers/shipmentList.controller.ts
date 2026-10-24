import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentListRequest {
  limit?: number;
  offset?: number;
  sortDirection?: "asc" | "desc";
  customerId?: string;
  /** The houses of the master job with this MCZ number */
  masterJobMcz?: string;
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
  /** Invoicing page filter: all | billing | not-invoiced | invoiced */
  invoicing?: string;
  search?: string;
  /** The grid columns the search looks in (the ones the user has chosen); all the usual ones when not given. */
  searchColumns?: string[];
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
    return shipmentService.list(getAuthData()!.companyID, {
      customerId: req.customerId,
      masterJobMcz: req.masterJobMcz?.trim() || undefined,
      status: req.status,
      statusBucket: req.statusBucket,
      tile: req.tile,
      warehouse: req.warehouse,
      customs: req.customs,
      invoicing: req.invoicing,
      search: req.search,
      searchColumns: req.searchColumns?.slice(0, 200),
      limit: Math.min(Math.max(req.limit ?? 100, 1), 200),
      offset: Math.max(req.offset ?? 0, 0),
      sortDirection: req.sortDirection ?? "desc",
    });
  },
);
