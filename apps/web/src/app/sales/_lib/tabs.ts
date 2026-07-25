export interface SalesTab {
  key: string;
  label: string;
}

// The POC's Sales sidebar becomes per-route tabs.
export const SALES_TABS: SalesTab[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "quotes", label: "Quote History" },
  { key: "followup", label: "Follow-up" },
  { key: "pipeline", label: "Pipeline" },
  { key: "report", label: "Sales Report" },
  { key: "shipments", label: "Shipment Reports" },
  { key: "terms", label: "Terms & Conditions" },
];
