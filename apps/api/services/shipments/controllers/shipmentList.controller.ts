import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
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
  /** Overview tile filter: active | attention | etamoved | import | export | week | nextweek | claims */
  tile?: string;
  /** Handled By: a user's e-mail (in any case), or "nobody" for the jobs nobody handles */
  handledBy?: string & MaxLen<320>;
  /** "My jobs": a user's e-mail (in any case), the jobs it names in Handled By or in Holiday Cover (mock council S9-1) */
  jobsOf?: string & MaxLen<320>;
  /** How the job travels: sea | air | rail | road */
  mode?: string & MaxLen<16>;
  /** Trade Direction: import | export | domestic, in any case */
  direction?: string & MaxLen<16>;
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
  /**
   * To bill / All only: the jobs with a charge added after their invoice could not be read from Invoicing just now,
   * so the list is without them (mock council S5-2). Left out otherwise.
   */
  lateChargesNotRead?: boolean;
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
      handledBy: req.handledBy?.trim() || undefined,
      jobsOf: req.jobsOf?.trim() || undefined,
      mode: req.mode,
      direction: req.direction,
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
