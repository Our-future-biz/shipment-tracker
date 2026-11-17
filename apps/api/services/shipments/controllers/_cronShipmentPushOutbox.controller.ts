import { api } from "encore.dev/api";
import { deliverShipmentPushes, startShipmentPushTimer } from "../services/shipmentPush.service";

startShipmentPushTimer();

interface ShipmentPushOutboxResponse {
  sent: number;
  retry: number;
  failed: number;
}

// Called by the cron only (expose: false), without a login: sends the shipment changes owed to
// Trucking and the gate records that could not go straight after their write.
export const _cronShipmentPushOutbox = api(
  { expose: false, auth: false, method: "POST", path: "/internal/shipments/push-outbox/deliver" },
  async (): Promise<ShipmentPushOutboxResponse> => deliverShipmentPushes(),
);
