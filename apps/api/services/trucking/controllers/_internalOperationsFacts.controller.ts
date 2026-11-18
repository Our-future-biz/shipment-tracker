import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { operationsFactsService } from "../services/operationsFacts.service";
import type { TruckingOperationsFacts } from "../interfaces/interfaces";

interface TruckingOperationsFactsRequest {
  /** The jobs (Shipments ids); ids that are not uuids are left out */
  shipmentIds: string[] & MaxLen<2000>;
}

/**
 * Internal API of the shipments service (Shipments → Managers, the operations cockpit; Council Outlay 11,
 * D29 / D30): per job, its consignments still in play with Trucking's own judgement of what is wrong now, and
 * Trucking's updates to the job waiting too long or failed - so the cockpit and Trucking never disagree. Read
 * only. Company from the caller's auth; any user of the company may ask, whatever Trucking's menu shows.
 */
export const _internalTruckingOperationsFacts = api(
  { expose: false, auth: true, method: "POST", path: "/internal/trucking/operations-facts" },
  async ({ shipmentIds }: TruckingOperationsFactsRequest): Promise<TruckingOperationsFacts> => {
    const auth = getAuthData()!;
    return operationsFactsService.forJobs(auth.companyID, auth.userID, shipmentIds);
  },
);
