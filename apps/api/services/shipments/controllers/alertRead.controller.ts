import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { alertService } from "../services/alert.service";

interface AlertReadResponse {
  /** When this user last opened the shipment's Alerts; null when never - every alert is new then. */
  readAt: string | null;
}

// When this user last opened a shipment's Alerts: what came later is new to them.
export const alertReadGet = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/alerts/read" },
  async ({ shipmentId }: { shipmentId: string }): Promise<AlertReadResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { readAt: await alertService.readAt(shipmentId, companyID, userID) };
  },
);

// Marks a shipment's Alerts as seen up to now (called when the Alerts tab is opened).
export const alertMarkRead = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/alerts/read" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ ok: boolean }> => {
    const { companyID, userID } = getAuthData()!;
    await alertService.markRead(shipmentId, companyID, userID);
    return { ok: true };
  },
);
