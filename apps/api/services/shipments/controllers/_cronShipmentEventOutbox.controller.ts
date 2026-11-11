import { api } from "encore.dev/api";
import { deliverShipmentEvents, startShipmentEventTimer } from "../services/shipmentEvents.service";

startShipmentEventTimer();

interface ShipmentEventOutboxResponse {
  sent: number;
  retry: number;
  failed: number;
}

// Called by the cron only (expose: false), without a login: publishes the shipment-deleted events
// not published straight after their delete.
export const _cronShipmentEventOutbox = api(
  { expose: false, auth: false, method: "POST", path: "/internal/shipments/event-outbox/deliver" },
  async (): Promise<ShipmentEventOutboxResponse> => deliverShipmentEvents(),
);
