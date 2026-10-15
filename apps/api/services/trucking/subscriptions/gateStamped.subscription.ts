import { Subscription } from "encore.dev/pubsub";
import { warehouseGateStamped } from "../../warehouse/topics";
import { ltlService } from "../services/ltl.service";

// Warehouse owns the gate; Trucking listens. A gate-in at our warehouse puts an LTL consignment
// at the hub (and makes its promised date final), a gate-out sends it on, a void steps it back.
export const truckingGateStamped = new Subscription(warehouseGateStamped, "trucking-gate-stamped", {
  handler: async (event) => {
    await ltlService.handleGateStamped(event);
  },
});
