import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { WarehouseOperationsFacts } from "../interfaces/interfaces";
import { operationsFactsService } from "../services/operationsFacts.service";

interface OperationsFactsRequest {
  /** The shipments (jobs) asked about; ids that are not uuids are left out. */
  shipmentIds: string[] & MaxLen<2000>;
}

// Internal API of the warehouse for Shipments → Managers (Council Outlay 11, step 5, D29/D30): for
// each shipment, its warehouse records still in play with the Warehouse cockpit's own signals, and
// its updates from the warehouse waiting too long or failed — so the two cockpits never disagree.
// READ ONLY. The company is the caller's, never the request's.
// A gate record belongs to a shipment through its LIVE warehouse task (warehouse_task.shipment_id),
// as everywhere else in the module. A record linked only through pickupShipmentId (its task was
// archived or unlinked; the pick-up PIN of that shipment still releases it) is NOT answered under
// that shipment — left so on purpose (step 5 review).
export const _internalWarehouseOperationsFacts = api(
  { expose: false, auth: true, method: "POST", path: "/internal/warehouse-concept/operations-facts" },
  async ({ shipmentIds }: OperationsFactsRequest): Promise<WarehouseOperationsFacts> => operationsFactsService.forShipments(getAuthData()!.companyID, shipmentIds),
);
