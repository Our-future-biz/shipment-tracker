import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { ShipmentTracking } from "../interfaces/interfaces";
import { buildTracking, TRACKING_AUDIT_FIELDS } from "../lib/trackingTimeline";
import { userEmails } from "../lib/userEmails";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";
import { shipmentService } from "./shipment.service";

/** How many logged changes the tab reads, newest first. */
export const TRACKING_CHANGES_LIMIT = 500;

class TrackingService {
  /** The shipment's Tracking tab: read from what it already holds, nothing is written. */
  async get(shipmentId: string, companyId: string, now = new Date()): Promise<ShipmentTracking> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound("Shipment not found");
    const [audit, tasks, customsStatus, names, invoiced] = await Promise.all([
      shipmentAuditRepository.listByShipmentId(shipmentId, companyId, TRACKING_AUDIT_FIELDS, TRACKING_CHANGES_LIMIT + 1),
      shipmentTaskRepository.listByShipmentId(shipmentId, companyId),
      shipmentService.customsStatusOf(shipment, companyId),
      userEmails(),
      this.invoiced(shipmentId),
    ]);
    return buildTracking({
      shipment,
      customsStatus,
      audit: audit.slice(0, TRACKING_CHANGES_LIMIT),
      changesCapped: audit.length > TRACKING_CHANGES_LIMIT,
      tasks,
      names,
      invoiced,
      now,
    });
  }

  // Invoicing being away must not take the timeline with it; the tab then just doesn't say.
  private async invoiced(shipmentId: string): Promise<boolean | null> {
    try {
      return await shipmentService.isInvoiced(shipmentId);
    } catch (err) {
      log.warn(err, "tracking: could not ask whether the job is invoiced", { shipmentId });
      return null;
    }
  }
}

export const trackingService = new TrackingService();
