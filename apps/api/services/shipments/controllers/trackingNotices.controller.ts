import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { TrackingBellNotice } from "../interfaces/interfaces";
import { customerNoticeService } from "../services/customerNotice.service";
import { trackingBellService } from "../services/trackingBell.service";

// The bell: moved dates, dates to confirm, and what the customer was told that no longer holds.
export const trackingBellNotices = api(
  { expose: true, auth: true, method: "GET", path: "/shipment-alerts/tracking" },
  async (): Promise<{ notices: TrackingBellNotice[] }> => {
    const { companyID, userID } = getAuthData()!;
    return { notices: await trackingBellService.notices(companyID, userID) };
  },
);

// The Tracking tab was opened: what the bell says about this shipment is no longer new.
export const trackingMarkRead = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/read" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ ok: boolean }> => {
    const { companyID, userID } = getAuthData()!;
    await trackingBellService.markRead(shipmentId, companyID, userID);
    return { ok: true };
  },
);

interface CustomerNoticeRecordRequest {
  shipmentId: string;
  kind: string & MinLen<1>;
  channel: string & MinLen<1>;
  toldTo?: string & MaxLen<500>;
  subject?: string & MaxLen<500>;
  note?: string & MaxLen<1000>;
  /** The checklist tick this notice comes with. */
  taskKey?: string;
}

// Somebody says the customer was told, with a copy of the dates as they stand. Open to any user:
// telling a customer changes nothing on the shipment.
export const customerNoticeRecord = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/customer-notices" },
  async ({ shipmentId, ...input }: CustomerNoticeRecordRequest): Promise<{ id: string }> => {
    const { companyID, userID } = getAuthData()!;
    const row = await customerNoticeService.record(shipmentId, companyID, userID, input);
    return { id: row.id };
  },
);
