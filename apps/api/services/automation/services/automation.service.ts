import log from "encore.dev/log";
import { iso } from "../../../lib/db/serialize";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { automationLogRepository } from "../repositories/automationLog.repository";
import type { AutomationLogRecord } from "../schemas/automationLog.schema";
import type { AutomationLogItem, FieldChange } from "../interfaces/interfaces";

const toItem = (r: AutomationLogRecord): AutomationLogItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  ruleName: r.ruleName,
  action: r.action,
  details: r.details,
  triggeredById: r.triggeredById,
  createdAt: iso(r.createdAt),
});

class AutomationService {
  async getLogsByShipmentId(shipmentId: string, companyId: string): Promise<AutomationLogItem[]> {
    return (await automationLogRepository.listByShipmentId(shipmentId, companyId)).map(toItem);
  }

  /**
   * Records a watched field change of a shipment. No automation rules run yet (the POC's rule
   * engine is not ported), so nothing else happens: the change is only written to the
   * automation log, and no actions are reported back.
   */
  async recordFieldChange(companyId: string, userId: string, change: FieldChange): Promise<{ actions: string[]; logs: AutomationLogItem[] }> {
    await assertShipmentExists(change.shipmentId);
    const row = await automationLogRepository.createForCompany(companyId, {
      shipmentId: change.shipmentId,
      ruleName: `field_change:${change.column}`,
      action: "recorded",
      details: { column: change.column, oldValue: change.oldValue, newValue: change.newValue, shipmentData: change.shipmentData },
      triggeredById: userId,
    });
    log.info("automation: field change recorded, no rules configured", { shipmentId: change.shipmentId, column: change.column });
    return { actions: [], logs: [toItem(row)] };
  }
}

export const automationService = new AutomationService();
