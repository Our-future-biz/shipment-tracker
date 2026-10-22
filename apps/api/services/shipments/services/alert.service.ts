import { iso } from "../../../lib/db/serialize";
import { shipmentAlertReadRepository } from "../repositories/shipmentAlertRead.repository";
import { shipmentService } from "./shipment.service";

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
}

export const alertService = new AlertService();
