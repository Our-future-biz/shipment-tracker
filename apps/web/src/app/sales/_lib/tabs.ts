export interface SalesNavItem {
  key: string;
  label: string;
  path: string;
}

// Sales submenu — each item is a real route, shown as a sidebar sub-menu.
export const SALES_NAV: SalesNavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/sales/dashboard" },
  { key: "quotes", label: "Quote History", path: "/sales/quotes" },
  { key: "followup", label: "Follow-up", path: "/sales/followup" },
  { key: "pipeline", label: "Pipeline", path: "/sales/pipeline" },
  { key: "report", label: "Sales Report", path: "/sales/report" },
  { key: "shipments", label: "Shipment Reports", path: "/sales/shipments" },
  { key: "terms", label: "Terms & Conditions", path: "/sales/terms" },
];
