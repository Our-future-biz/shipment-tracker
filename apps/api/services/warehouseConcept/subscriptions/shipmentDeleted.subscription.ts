import { Subscription } from "encore.dev/pubsub";
import { shipmentDeleted } from "../../shipments/topics";
import { warehouseService } from "../services/warehouse.service";

// No foreign keys cross service databases: a deleted shipment's warehouse rows are retired here.
export const warehouseShipmentDeleted = new Subscription(shipmentDeleted, "warehouse-shipment-deleted", {
  handler: async ({ shipmentId, companyId }) => {
    await warehouseService.retireShipment(shipmentId, companyId);
  },
});
