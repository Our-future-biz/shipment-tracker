import { Subscription } from "encore.dev/pubsub";
import { shipmentDeleted } from "../../shipments/topics";
import { consignmentService } from "../services/consignment.service";

// No foreign keys cross service databases: a deleted job's open consignments are cancelled here
// (those already picked up are kept, with an event).
export const truckingShipmentDeleted = new Subscription(shipmentDeleted, "trucking-shipment-deleted", {
  handler: async ({ shipmentId, companyId }) => {
    await consignmentService.retireShipment(shipmentId, companyId);
  },
});
