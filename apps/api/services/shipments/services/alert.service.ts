import { iso } from "../../../lib/db/serialize";
import { userEmailOf } from "../../../lib/companyUsers";
import type { CustomsVerdictNotice, RemeasureInformedItem, RemeasureSource } from "../interfaces/interfaces";
import { companyUsers } from "../../../lib/companyUsers";
import { REMEASURE_INFORMED, differenceText, remeasureVerdict } from "../lib/remeasureNotice";
import { readFigures } from "../lib/remeasureAccept";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { userEmails } from "../lib/userEmails";
import { shipmentAlertReadRepository } from "../repositories/shipmentAlertRead.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentService } from "./shipment.service";

/** How far back the bell looks for a verdict not seen yet, and keeps one seen. */
const VERDICT_KEEP_DAYS = 30;
const READ_VERDICT_KEEP_DAYS = 7;
const VERDICTS_LIMIT = 100;
const DAY_MS = 86_400_000;
/** The most Inform Operations of one shipment the Alerts tab lists. */
const REMEASURE_INFORMED_LIMIT = 50;

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
   * Every Inform Operations of the shipment, newest first, with how its figures stand and which
   * warehouse informed (a record written before the warehouse was kept with it counts as the Warehouse's).
   */
  async remeasureInformed(shipmentId: string, companyId: string): Promise<RemeasureInformedItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    const rows = await shipmentAuditRepository.listByShipmentId(shipmentId, companyId, [REMEASURE_INFORMED], REMEASURE_INFORMED_LIMIT);
    if (rows.length === 0) return [];
    const users = await companyUsers().catch(() => []);
    return rows.map((r) => {
      const shipment = readFigures(r.oldValue);
      const remeasured = readFigures(r.newValue);
      let comparedWith = "";
      let source: RemeasureSource = "warehouse";
      try {
        const v = JSON.parse(r.newValue ?? "") as { comparedWith?: unknown; source?: unknown };
        comparedWith = typeof v.comparedWith === "string" ? v.comparedWith : "";
        if (v.source === "warehouseConcept") source = "warehouseConcept";
      } catch {
        comparedWith = "";
      }
      const by = users.find((u) => u.id === r.userId);
      return {
        id: r.id,
        informedAt: iso(r.changedAt)!,
        informedBy: by ? by.displayName || by.email : "",
        shipment,
        remeasured,
        comparedWith,
        source,
        verdict: remeasureVerdict(shipment, remeasured),
        difference: differenceText(shipment, remeasured),
      };
    });
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
