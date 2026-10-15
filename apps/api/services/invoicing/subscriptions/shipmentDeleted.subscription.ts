import { Subscription } from "encore.dev/pubsub";
import { shipmentDeleted } from "../../shipments/topics";
import { invoicingService } from "../services/invoicing.service";

// No foreign keys cross service databases: a deleted shipment's invoicing rows are retired here.
export const invoicingShipmentDeleted = new Subscription(shipmentDeleted, "invoicing-shipment-deleted", {
  handler: async ({ shipmentId, companyId }) => {
    await invoicingService.retireShipment(shipmentId, companyId);
  },
});
