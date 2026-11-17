import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { CoverNotesNotice } from "../interfaces/interfaces";
import { coverBellService } from "../services/coverBell.service";

interface CoverNotesForMeResponse {
  notices: CoverNotesNotice[];
}

// The bell: shipments somebody else made the user the Handled By or Holiday Cover of, with their
// open to-dos, in one answer (titles included), until the user opens the shipment's Notes To-Do tab.
export const coverNotesForMe = api(
  { expose: true, auth: true, method: "GET", path: "/shipment-notes/for-me" },
  async (): Promise<CoverNotesForMeResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { notices: await coverBellService.forMe(companyID, userID) };
  },
);

// The Notes To-Do tab was opened: the bell no longer lists the shipment for this user.
export const coverNotesMarkRead = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/notes/read" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ ok: boolean }> => {
    const { companyID, userID } = getAuthData()!;
    await coverBellService.markRead(shipmentId, companyID, userID);
    return { ok: true };
  },
);
