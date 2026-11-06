import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { TrackingAttentionItem } from "../interfaces/interfaces";
import { trackingAttentionService } from "../services/trackingAttention.service";

interface TrackingAttentionResponse {
  items: TrackingAttentionItem[];
  /** There are more active shipments than were looked at: the oldest are left out. */
  capped: boolean;
}

/** Active shipments whose dates need a look: passed with nothing recorded, unconfirmed, untold, unbilled. */
export const shipmentTrackingAttention = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/tracking-attention" },
  async (): Promise<TrackingAttentionResponse> => {
    return trackingAttentionService.list(getAuthData()!.companyID);
  },
);
