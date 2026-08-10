import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { automationService } from "../services/automation.service";
import type { AutomationLogItem } from "../interfaces/interfaces";

interface AutomationTriggerRequest {
  shipmentId: string;
  column: string;
  oldValue: string;
  newValue: string;
  shipmentData?: Record<string, string>;
}

interface AutomationTriggerResponse {
  actions: string[];
  logs: AutomationLogItem[];
}

export const automationTrigger = api(
  { expose: true, auth: true, method: "POST", path: "/automation/trigger" },
  async (req: AutomationTriggerRequest): Promise<AutomationTriggerResponse> => {
    if (!req.shipmentId || !req.column) {
      throw APIError.invalidArgument("shipmentId and column are required");
    }
    const auth = getAuthData()!;
    // TODO: Port the 24-rule automation engine from POC
    // For now, just log the trigger. Actor comes from the token, never the client.
    const log = await automationService.logAction(
      req.shipmentId,
      auth.companyID,
      `field_change:${req.column}`,
      "triggered",
      { column: req.column, oldValue: req.oldValue, newValue: req.newValue, shipmentData: req.shipmentData },
      auth.userID,
    );
    return { actions: ["triggered"], logs: [log as unknown as AutomationLogItem] };
  },
);
