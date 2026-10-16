import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface CustomerShipmentIdsRequest {
  customerId: string;
  shipmentIds: string[] & MaxLen<200>;
}

interface CustomerShipmentIdsResponse {
  /** The given ids that are live shipments of this customer in the caller's company. */
  shipmentIds: string[];
}

/**
 * Internal API of the customers service: which of the given shipments really belong to the
 * customer (live, of the caller's company), before their costs are read for its Shipments tab.
 */
export const _internalCustomerShipmentIds = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/of-customer" },
  async (req: CustomerShipmentIdsRequest): Promise<CustomerShipmentIdsResponse> => {
    return { shipmentIds: await shipmentService.idsOfCustomer(getAuthData()!.companyID, req.customerId, req.shipmentIds) };
  },
);
