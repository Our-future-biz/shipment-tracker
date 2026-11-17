import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface CustomerShipmentCountRequest {
  customerId: string;
}

interface CustomerShipmentCountResponse {
  /** Live shipments of the customer in the caller's company. */
  count: number;
}

/**
 * Internal API of the customers service: how many live shipments a customer has, asked before it
 * is deleted - a customer its shipments still name is kept.
 */
export const _internalCustomerShipmentCount = api(
  { expose: false, auth: true, method: "GET", path: "/internal/shipments/customer-shipment-count/:customerId" },
  async ({ customerId }: CustomerShipmentCountRequest): Promise<CustomerShipmentCountResponse> => {
    return { count: await shipmentService.countOfCustomer(getAuthData()!.companyID, customerId) };
  },
);
