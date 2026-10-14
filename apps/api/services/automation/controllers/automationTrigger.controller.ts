import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { automationService } from "../services/automation.service";
import type { AutomationLogItem } from "../interfaces/interfaces";

interface AutomationTriggerRequest {
  shipmentId: string & MinLen<1>;
  column: string & MinLen<1> & MaxLen<200>;
  oldValue: string;
  newValue: string;
  shipmentData?: Record<string, string>;
}

interface AutomationTriggerResponse {
  /** Actions the rules took; empty while no rules are configured. */
  actions: string[];
  logs: AutomationLogItem[];
}

// A watched field of a shipment changed. Only recorded in the automation log for now: the rule
// engine isn't ported yet, so no actions run. The actor comes from the token, never the client.
export const automationTrigger = api(
  { expose: true, auth: true, method: "POST", path: "/automation/trigger" },
  async ({ shipmentId, column, oldValue, newValue, shipmentData }: AutomationTriggerRequest): Promise<AutomationTriggerResponse> => {
    const auth = getAuthData()!;
    return automationService.recordFieldChange(auth.companyID, auth.userID, { shipmentId, column, oldValue, newValue, shipmentData });
  },
);
