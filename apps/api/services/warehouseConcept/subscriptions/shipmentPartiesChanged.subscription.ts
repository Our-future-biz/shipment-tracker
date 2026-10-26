import { Subscription } from "encore.dev/pubsub";
import { shipmentPartiesChanged } from "../../shipments/topics";
import { gatePartiesService } from "../services/gateParties.service";

// A shipment's Customer or Customer's PIC changed (an edit, or a rename in the Customer Database):
// its gate records follow. The event is only the signal — the names in it may be older than ones
// applied already, so follow() reads the shipment as it is now. Repeating it changes nothing.
export const warehouseShipmentPartiesChanged = new Subscription(shipmentPartiesChanged, "warehouse-shipment-parties-changed", {
  handler: async ({ companyId, shipmentId }) => {
    await gatePartiesService.follow(companyId, shipmentId);
  },
});
