import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentDueItem } from "../interfaces/interfaces";

interface ShipmentNeedsAttentionResponse {
  within24h: ShipmentDueItem[];
  within48h: ShipmentDueItem[];
}

/** Active shipments with a deadline in the next 24 / 48 hours, over the whole company dataset. */
export const shipmentNeedsAttention = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/needs-attention" },
  async (): Promise<ShipmentNeedsAttentionResponse> => {
    return shipmentService.needsAttention(getAuthData()!.companyID);
  },
);
