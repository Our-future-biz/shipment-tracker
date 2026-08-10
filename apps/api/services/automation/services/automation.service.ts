import { automationLogRepository } from "../repositories/automationLog.repository";

class AutomationService {
  async getLogsByShipmentId(shipmentId: string, companyId: string) {
    return automationLogRepository.listByShipmentId(shipmentId, companyId);
  }

  async logAction(shipmentId: string, companyId: string, ruleName: string, action: string, details?: unknown, triggeredById?: string) {
    return automationLogRepository.create({ companyId, shipmentId, ruleName, action, details: details ?? {}, triggeredById: triggeredById ?? null });
  }
}

export const automationService = new AutomationService();
