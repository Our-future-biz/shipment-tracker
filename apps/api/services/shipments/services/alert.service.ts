import { iso } from "../../../lib/db/serialize";
import { userEmailOf } from "../../../lib/companyUsers";
import type { CustomsVerdictNotice } from "../interfaces/interfaces";
import { userEmails } from "../lib/userEmails";
import { shipmentAlertReadRepository } from "../repositories/shipmentAlertRead.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentService } from "./shipment.service";

/** How far back the bell looks for a verdict not seen yet, and keeps one seen. */
const VERDICT_KEEP_DAYS = 30;
const READ_VERDICT_KEEP_DAYS = 7;
const VERDICTS_LIMIT = 100;
const DAY_MS = 86_400_000;

// A shipment's Alerts are worked out from what they are about (customs' verdict on a document);
// only when each user last opened them is kept here, so the tab can count what is new to them.
class AlertService {
  async readAt(shipmentId: string, companyId: string, userId: string): Promise<string | null> {
    await shipmentService.requireLive(shipmentId, companyId);
    const at = await shipmentAlertReadRepository.readAt(companyId, userId, shipmentId);
    return at ? iso(at) : null;
  }

  async markRead(shipmentId: string, companyId: string, userId: string): Promise<void> {
    await shipmentService.requireLive(shipmentId, companyId);
    await shipmentAlertReadRepository.markRead(companyId, userId, shipmentId);
  }

  /**
   * The bell: customs' verdicts on the shipments this user is the Person in Charge or Holiday
   * Cover of. New until they open the shipment's Alerts, the same moment the tab's count goes.
   */
  async customsVerdicts(companyId: string, userId: string, now = Date.now()): Promise<CustomsVerdictNotice[]> {
    const email = (await userEmailOf(userId).catch(() => "")).trim().toLowerCase();
    if (!email) return [];
    const rows = await shipmentAttachmentRepository.customsVerdictsFor(
      companyId,
      userId,
      email,
      new Date(now - VERDICT_KEEP_DAYS * DAY_MS),
      new Date(now - READ_VERDICT_KEEP_DAYS * DAY_MS),
      VERDICTS_LIMIT,
    );
    const emails = await userEmails();
    return rows.map((r) => ({
      id: r.id,
      shipmentId: r.shipmentId,
      jobNumber: r.jobNumber ?? "",
      fileName: r.fileName,
      documentType: r.documentType,
      status: r.status === "approved" ? "approved" : "declined",
      note: r.note,
      reviewedAt: iso(r.reviewedAt!),
      reviewedByName: r.reviewedById ? (emails.get(r.reviewedById) ?? "") : "",
      unread: !r.readAt || r.reviewedAt! > r.readAt,
    }));
  }
}

export const alertService = new AlertService();
