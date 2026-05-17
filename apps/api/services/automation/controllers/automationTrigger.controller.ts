import { api, APIError } from "encore.dev/api";
import { automationService } from "../services/automation.service";
import type { AutomationLogItem } from "../interfaces/interfaces";

interface AutomationTriggerRequest {
  shipmentId: string;
  column: string;
  oldValue: string;
  newValue: string;
  triggeredById?: string;
  shipmentData?: Record<string, string>;
}

interface AutomationTriggerResponse {
  actions: string[];
  logs: AutomationLogItem[];
}

export const automationTrigger = api(
  { expose: true, auth: false, method: "POST", path: "/automation/trigger" },
  async (req: AutomationTriggerRequest): Promise<AutomationTriggerResponse> => {
    if (!req.shipmentId || !req.column) {
      throw APIError.invalidArgument("shipmentId and column are required");
    }
    // TODO: Port the 24-rule automation engine from POC
    // For now, just log the trigger
    const log = await automationService.logAction(
      req.shipmentId,
      `field_change:${req.column}`,
      "triggered",
      { column: req.column, oldValue: req.oldValue, newValue: req.newValue, shipmentData: req.shipmentData },
      req.triggeredById,
    );
    return { actions: ["triggered"], logs: [log as unknown as AutomationLogItem] };
  },
);
