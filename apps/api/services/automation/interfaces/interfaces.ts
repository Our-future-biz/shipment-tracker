export interface AutomationLogItem {
  id: string;
  shipmentId: string;
  ruleName: string;
  action: string;
  details: unknown;
  triggeredById: string | null;
  createdAt: string;
}
