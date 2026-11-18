import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { CustomsVerdictNotice, RemeasureInformedItem } from "../interfaces/interfaces";
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

// The bell: customs' verdicts on the shipments this user is the Person in Charge or Holiday Cover of.
export const customsVerdictNotices = api(
  { expose: true, auth: true, method: "GET", path: "/shipment-alerts/customs-verdicts" },
  async (): Promise<{ verdicts: CustomsVerdictNotice[] }> => {
    const { companyID, userID } = getAuthData()!;
    return { verdicts: await alertService.customsVerdicts(companyID, userID) };
  },
);

// Every time the warehouse informed Operations of a remeasurement: the Alerts tab lists those whose
// figures differ from the shipment's (a match is only its chat message, in Notifications).
export const alertRemeasureInformed = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/alerts/remeasurements" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ informed: RemeasureInformedItem[] }> => {
    return { informed: await alertService.remeasureInformed(shipmentId, getAuthData()!.companyID) };
  },
);
