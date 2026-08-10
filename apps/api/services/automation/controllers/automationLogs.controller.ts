import { api } from "encore.dev/api";
import { automationService } from "../services/automation.service";
import type { AutomationLogItem } from "../interfaces/interfaces";

interface AutomationLogsRequest {
  shipmentId: string;
}

interface AutomationLogsResponse {
  logs: AutomationLogItem[];
}

export const automationLogs = api(
  { expose: true, auth: true, method: "GET", path: "/automation/:shipmentId/logs" },
  async (req: AutomationLogsRequest): Promise<AutomationLogsResponse> => {
    const logs = await automationService.getLogsByShipmentId(req.shipmentId);
    return { logs: logs as unknown as AutomationLogItem[] };
  },
);
