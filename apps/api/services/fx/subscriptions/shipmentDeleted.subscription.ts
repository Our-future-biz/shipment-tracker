import { Subscription } from "encore.dev/pubsub";
import { shipmentDeleted } from "../../shipments/topics";
import { jobRateRepository } from "../repositories/jobRate.repository";

// No foreign keys cross service databases: a deleted shipment's rate lock is retired here.
export const fxShipmentDeleted = new Subscription(shipmentDeleted, "fx-shipment-deleted", {
  handler: async ({ shipmentId, companyId }) => {
    await jobRateRepository.softDeleteForShipment(companyId, shipmentId);
  },
});
