export interface Shipment {
  row: number;
  jobNumber: string;
  month: string;
  dept: string;
  handler: string;
  shipper: string;
  consignee: string;
  customsStatus: string;
  status: string;
  shipmentType: string;
  fclLcl: string;
  shippingLine: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  etaDepo: string;
  etaCnee: string;
  etaCneeTime?: string;
  vessel: string;
  voyage?: string;
  goods: string;
  hsCode: string;
  booking?: string;
  myRef?: string;
  cntr?: string;
  crd?: string;
  pu?: string;
  closing?: string;
  destination?: string;
  extra?: Record<string, string>;
}

// NEW ENGLISH STATUS VALUES (Shipment Status)
export const STATUS_COLORS: Record<string, string> = {
  "Billed [IMP]": "var(--brand-green)",
  "Billed [EXP]": "var(--brand-green)",
  "Delivery Date Pending From Customer [IMP]": "#FFC107",
  "Pre-Alert Received - Further Transport To Be Booked [IMP]": "var(--brand-orange)",
  "Booked For Further Transport [IMP]": "#FFD54F",
  "All Done - Waiting To Be Shipped [IMP]": "var(--brand-blue)",
  "All Done - Waiting To Be Shipped [EXP]": "var(--brand-blue)",
  "Booking Confirmation Pending [IMP]": "var(--brand-red-strong)",
  "Booking Confirmation Pending [EXP]": "var(--brand-red-strong)",
  "Pick Up Date Pending From Customer [EXP]": "#CE93D8",
  "Billing [IMP]": "#66BB6A",
  "Billing [EXP]": "#66BB6A",
  "Arrival Notice Sent - Waiting For Instructions [IMP]": "#9E9E9E",
  "Customs Clearance Pending [IMP]": "#F48FB1",
  "Loaded - Customs Clearance In Progress [EXP]": "#F48FB1",
  "Pre-Alert Sent [EXP]": "#9CCC65",
};

export const CUSTOMS_STATUS_COLORS: Record<string, string> = {
  "Customs Cleared/Released": "#E8F5E9",
  "Paperwork Verified": "#E8F5E9",
  "Paperwork Verification Pending": "#FFF9C4",
  "Waiting For Commercial Paperwork": "#FFFFFF",
};

// NEW COLUMN ORDER — reflects tasks A, C, E, F, G, J, M-Q, U-V, X-CC
export const COLUMNS = [
  // Locked first two
  "Internal Reference", "Master job",
  // Meta
  "Shipments Date", "Department", "Person In Charge", "Holiday Cover",
  // Customer block — Customer's PIC + Customer Reference moved right after Customer (U-V)
  "Customer", "Customer's PIC", "Customer Reference",
  // Pickup + POL (E)
  "Pickup Address", "POL",
  // Shipper/Consignee
  "Shipper", "Consignee",
  // Delivery + POD (F)
  "Delivery Address", "POD",
  // Status block
  "Customs Status", "Shipment Status", "Free Comments", "Freight Mode",
  // References
  "Container Number", "Personal Reference", "Booking Number", "Load Type", "Trade Direction",
  // Agents
  "Agent", "Agent's PIC", "Shipping line / Coloader", "Service Type",
  "Incoterm Origin", "Incoterm Destination", "Insurance",
  // Dates
  "Cargo Readyness Date", "Pickup Date", "Pickup Time", "Closing Date",
  "Estimated Departure", "Estimated Arrival",
  "ETA Warehouse/HUB", "Planned Delivery Date", "Planned Delivery Time", "Cargo Origin",
  // (Country code, Origin, Destination DELETED - task G)
  // Commercial
  "Commercial Invoice", "Commercial Invoice Value", "HS Code",
  "Cargo Description", "Credit Check", "Approved By", "Booking Confirmation",
  "Customs Procedure", "Equipment Delivery/Pickup", "Supplier's PIC",
  "VGM", "Shipping Instructions", "AMS (if any)", "ISF (if any)", "BoL draft",
  // Switch BoL + Approved By (task J)
  "Switch BoL", "Switch BoL Approved By", "Switch BoL Number",
  "House BoL Number", "House BoL Type", "Master BoL Number", "Master BoL Type",
  "Vessel", "Voyage",
  // Containers
  "Amount Of Containers (1)", "Container's Length (1)", "Container's Type (1)",
  "Amount Of Containers (2)", "Container's Length (2)", "Container's Type (2)",
  "Amount Of Containers (3)", "Container's Length (3)", "Container's Type (3)",
  "Amount Of Containers (4)", "Container's Length (4)", "Container's Type (4)",
  "TEU",
  // Dimensions (task L — click to open popup)
  "Dimensions",
  // (Dims-Length, Dims-Height, Stackable, PCS, Packing DELETED - M,N,O,P,Q)
  // Computed totals (tasks R, S, T)
  "Total Weight In Tons", "Total Volume In CBM", "Freight Ton", "Surface",
  // Quote
  "Sales Number", "Selling", "Quote Validity", "Validity Status",
  // (Buying me, Buying Sales/Rates, Trucking buy, Trucking sell, Mutual profit, Truck no. DELETED - X-CC)
  "Claim",
  "Created by",
];

// Maps shipment fields (internal keys) to new Full Sheet column display names.
// Internal fields on the Shipment interface stay the same for backward compat with DB edits.
export function getColumnValue(s: Shipment, col: string): string {
  const map: Record<string, string | undefined> = {
    "Internal Reference": s.jobNumber,
    "Shipments Date": s.month,
    "Department": s.dept,
    "Person In Charge": s.handler,
    "Shipper": s.shipper,
    "Consignee": s.consignee,
    "Customs Status": s.customsStatus,
    "Shipment Status": s.status,
    "Trade Direction": s.shipmentType,
    "Load Type": s.fclLcl,
    "Shipping line / Coloader": s.shippingLine,
    "POL": s.pol,
    "POD": s.pod,
    "Estimated Departure": s.etd,
    "Estimated Arrival": s.eta,
    "ETA Warehouse/HUB": s.etaDepo,
    "Planned Delivery Date": s.etaCnee,
    "Planned Delivery Time": s.etaCneeTime,
    "Vessel": s.vessel,
    "Voyage": s.voyage,
    "Cargo Description": s.goods,
    "HS Code": s.hsCode,
    "Booking Number": s.booking,
    "Personal Reference": s.myRef,
    "Container Number": s.cntr,
    "Cargo Readyness Date": s.crd,
    "Pickup Date": s.pu,
    "Closing Date": s.closing,
  };
  return map[col] ?? (s.extra?.[col] ?? "");
}

export const SHIPMENTS: Shipment[] = [];

// Helper to parse MM/DD/YY date strings
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const year = 2000 + parseInt(parts[2], 10);
  return new Date(year, month - 1, day);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// New English status values
export function isActiveStatus(status: string): boolean {
  return status !== "Billed [IMP]" && status !== "Billed [EXP]";
}

export function isCompletedStatus(status: string): boolean {
  return status === "Billed [IMP]" || status === "Billed [EXP]";
}
