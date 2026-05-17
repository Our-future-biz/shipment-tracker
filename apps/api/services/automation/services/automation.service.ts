import { automationLogRepository } from "../repositories/automationLog.repository";

class AutomationService {
  async getLogsByShipmentId(shipmentId: string) {
    return automationLogRepository.listByShipmentId(shipmentId);
  }

  async logAction(shipmentId: string, ruleName: string, action: string, details?: unknown, triggeredById?: string) {
    return automationLogRepository.create({ shipmentId, ruleName, action, details: details ?? {}, triggeredById: triggeredById ?? null });
  }
}

export const automationService = new AutomationService();
