import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { getAuthData } from "~encore/auth";
import { invoiceRepository } from "../repositories/invoice.repository";

/**
 * Jobs with a charge added after their invoice the shipments list is told of at most, the newest first. The ids are
 * small, so the cap is well above what one queue view lists; reaching it is logged, as the oldest such jobs then drop
 * out of To bill, All and their counts without the client being told.
 */
export const LATE_CHARGE_JOB_LIMIT = 5000;

interface LateChargeShipmentsResponse {
  /** The jobs with an open invoice and a selling line above nothing on no invoice: a charge to bill. Newest first, at most 5000. */
  shipmentIds: string[];
}

// Internal API of the shipments service (the Invoicing page's lists, User Council B4, owner's answer Q9): a job
// invoiced before operations set Billing that then gets a charge reads Not Invoiced with its status unchanged, so
// without this it is in no Invoicing tab. "To bill" lists these whatever their Shipment Status. Read only. Company
// from the caller's auth.
export const _internalLateChargeShipments = api(
  { expose: false, auth: true, method: "GET", path: "/internal/invoicing/late-charge-shipments" },
  async (): Promise<LateChargeShipmentsResponse> => {
    const companyId = getAuthData()!.companyID;
    const shipmentIds = await invoiceRepository.lateChargeShipmentIds(companyId, LATE_CHARGE_JOB_LIMIT);
    if (shipmentIds.length >= LATE_CHARGE_JOB_LIMIT) {
      log.warn("jobs with a charge added after their invoice reached the limit; the oldest are left out of To bill and All", { companyId, limit: LATE_CHARGE_JOB_LIMIT });
    }
    return { shipmentIds };
  },
);
