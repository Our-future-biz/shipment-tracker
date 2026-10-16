import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { currencyOf, shipmentFinancialsService } from "../services/shipmentFinancials.service";
import type { ShipmentFinancials } from "../interfaces/interfaces";

interface CustomerShipmentFinancialsRequest {
  id: string;
  /** The shipments shown (a page of the customer's Shipments tab). */
  shipmentIds: string[] & MaxLen<100>;
  /** Totals are also given in this currency (default CZK), e.g. the customer's. */
  currency?: string & MaxLen<3>;
}

interface CustomerShipmentFinancialsResponse {
  /** One per given shipment that is a live shipment of this customer, in the order given. */
  items: ShipmentFinancials[];
}

// Revenue, cost and profit of the customer's shipments, as each job's Costs Breakdown works them out.
export const customerShipmentFinancials = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:id/shipment-financials" },
  async (req: CustomerShipmentFinancialsRequest): Promise<CustomerShipmentFinancialsResponse> => {
    const items = await shipmentFinancialsService.forShipments(getAuthData()!.companyID, req.id, req.shipmentIds, currencyOf(req.currency));
    return { items };
  },
);
