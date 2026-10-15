import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { CustomerShipmentFacts } from "../interfaces/interfaces";

interface ShipmentCustomerFactsResponse {
  /** One entry per customer that a live shipment of the company is for. */
  customers: CustomerShipmentFacts[];
  /** Live shipments without a customer record: they can place no customer. */
  shipmentsWithoutCustomer: number;
}

/**
 * Internal API of the sales service: what the shipments of the caller's company say about its
 * customers. Customers and quotes live in other databases, so the sales service joins this with
 * their facts into the customer pipeline; nothing of the pipeline is stored.
 */
export const _internalShipmentCustomerFacts = api(
  { expose: false, auth: true, method: "GET", path: "/internal/shipments/customer-facts" },
  async (): Promise<ShipmentCustomerFactsResponse> => {
    return shipmentService.customerFacts(getAuthData()!.companyID);
  },
);
