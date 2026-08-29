export type ColumnType = "text" | "dropdown" | "date" | "checkbox" | "computed" | "popup";

export interface ColumnDef {
  key: string;        // Internal field key (maps to API field)
  title: string;      // Display header
  width: number;
  type: ColumnType;
  options?: string[];
  fixed?: boolean;    // Cannot be moved (always first)
  readonly?: boolean; // Cannot be edited inline
  apiField?: string;  // API field name on ShipmentItem (if different from key, or for explicit mapping)
}

// ─── Dropdown Options ─────────────────────────────────────────────────

export const DROPDOWN_OPTIONS: Record<string, string[]> = {
  "Shipments Date": [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  "Department": ["Operation Department", "Custom Department", "Administration Department", "Road Department"],
  "Customs Status": [
    "Waiting For Commercial Paperwork",
    "Paperwork Verification Pending",
    "Paperwork Verified",
    "Under Customs Clearance",
    "Customs Cleared/Released",
  ],
  "Shipment Status": [
    "Booking Confirmation Pending [IMP]",
    "All Done - Waiting To Be Shipped [IMP]",
    "Arrival Notice Sent - Waiting For Instructions [IMP]",
    "Pre-Alert Received - Further Transport To Be Booked [IMP]",
    "Booked For Further Transport [IMP]",
    "Delivery Date Pending From Customer [IMP]",
    "Customs Clearance Pending [IMP]",
    "Billing [IMP]",
    "Billed [IMP]",
    "---",
    "Booking Confirmation Pending [EXP]",
    "Pick Up Date Pending From Customer [EXP]",
    "All Done - Waiting To Be Shipped [EXP]",
    "Loaded - Customs Clearance In Progress [EXP]",
    "Pre-Alert Sent [EXP]",
    "Billing [EXP]",
    "Billed [EXP]",
  ],
  "Load Type": ["Full Load", "Consolidation", "Customs Clearance"],
  "Trade Direction": ["Import", "Export"],
  "Freight Mode": ["Air Freight", "Sea Freight", "Rail Freight", "Road Freight"],
  "Service Type": ["Direct", "In-Direct/Nominated"],
  "Incoterm Origin": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"],
  "Incoterm Destination": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"],
  "Insurance": ["Yes", "Pending", "No"],
  "Credit Check": ["Green", "Yellow", "Red"],
  "Validity Status": ["Ok", "Check"],
  "Switch BoL": ["YES", "NO"],
  "House BoL Type": ["OBL", "SWB", "Telex", "OHBL ok", "Direct MBL"],
  "Master BoL Type": ["OBL", "SWB", "Telex", "OMBL ok"],
  "Container's Length (1)": ["20", "40"],
  "Container's Length (2)": ["20", "40"],
  "Container's Length (3)": ["20", "40"],
  "Container's Length (4)": ["20", "40"],
  "Container's Type (1)": ["GP", "HC", "RF", "HR", "OT", "HOT", "FR"],
  "Container's Type (2)": ["GP", "HC", "RF", "HR", "OT", "HOT", "FR"],
  "Container's Type (3)": ["GP", "HC", "RF", "HR", "OT", "HOT", "FR"],
  "Container's Type (4)": ["GP", "HC", "RF", "HR", "OT", "HOT", "FR"],
  "Customs Procedure": ["SCP", "JSD", "T1", "C-Goods"],
  "Shipping Instructions": ["Not Queried", "Not Received", "Confirmed"],
  "VGM": ["Pending (Red)", "Confirmed (Green)", "Customer", "Not Applicable"],
  "AMS (if any)": ["Pending (Red)", "Confirmed (Green)", "Not Applicable"],
  "ISF (if any)": ["Pending (Red)", "Confirmed (Green)", "Not Applicable"],
  "BoL draft": ["Not Processed", "Waiting for approval", "Approved"],
  "Invoicing Status": ["Invoiced", "Not Invoiced"],
  "Claim": ["Yes", "No"],
  "Booking Confirmation": ["Pending", "Received"],
};

// ─── Date Columns ─────────────────────────────────────────────────────

export const DATE_COLUMNS = new Set([
  "cargoReadinessDate", "pickupDate", "pickupTime", "closingDate",
  "estimatedDeparture", "estimatedArrival", "actualDeparture", "actualArrival",
  "etaWarehouse", "plannedDeliveryDate", "plannedDeliveryTime",
  "quoteValidity", "equipmentDeliveryDate",
]);

// ─── Computed / Read-only Columns ───────────────────────────────��─────

export const COMPUTED_COLUMNS = new Set([
  "teu", "totalWeightTons", "totalVolumeCbm", "freightTon", "surface", "profit",
  "estimatedDepartureWeek", "estimatedArrivalWeek", "actualDepartureWeek", "actualArrivalWeek",
  "shipmentsDate",
]);

// ─── Column Definitions (Full Sheet) ──────────────────────────────────

export const COLUMNS: ColumnDef[] = [
  // Locked columns (always first two)
  { key: "jobNumber", title: "Internal Reference", width: 140, type: "text", fixed: true, readonly: true, apiField: "jobNumber" },
  { key: "masterJob", title: "Master job", width: 140, type: "text", fixed: true, readonly: true, apiField: "masterJobMczNumber" },

  // Meta
  { key: "shipmentsDate", title: "Shipments Date", width: 120, type: "computed", readonly: true },
  { key: "department", title: "Department", width: 170, type: "dropdown", options: DROPDOWN_OPTIONS["Department"], apiField: "department" },
  { key: "personInCharge", title: "Person In Charge", width: 180, type: "text", apiField: "personInCharge" },
  { key: "holidayCover", title: "Holiday Cover", width: 140, type: "text", apiField: "holidayCover" },

  // Customer block
  { key: "customer", title: "Customer", width: 180, type: "text", apiField: "customer" },
  { key: "customerPic", title: "Customer's PIC", width: 170, type: "text", apiField: "customerPic" },
  { key: "customerReference", title: "Customer Reference", width: 170, type: "text", apiField: "customerReference" },

  // Pickup + POL
  { key: "pickupAddress", title: "Pickup Address", width: 200, type: "text", apiField: "pickupAddress" },
  { key: "pol", title: "POL", width: 100, type: "text", apiField: "pol" },

  // Shipper/Consignee
  { key: "shipper", title: "Shipper", width: 180, type: "text", apiField: "shipper" },
  { key: "consignee", title: "Consignee", width: 180, type: "text", apiField: "consignee" },

  // Delivery + POD
  { key: "deliveryAddress", title: "Delivery Address", width: 200, type: "text", apiField: "deliveryAddress" },
  { key: "pod", title: "POD", width: 100, type: "text", apiField: "pod" },
  { key: "destination", title: "Destination", width: 130, type: "text", apiField: "destination" },

  // Status block
  { key: "customsStatus", title: "Customs Status", width: 210, type: "dropdown", options: DROPDOWN_OPTIONS["Customs Status"], apiField: "customsStatus" },
  { key: "status", title: "Shipment Status", width: 320, type: "dropdown", options: DROPDOWN_OPTIONS["Shipment Status"], apiField: "status" },
  { key: "freeComments", title: "Free Comments", width: 200, type: "text", apiField: "freeComments" },
  { key: "freightMode", title: "Freight Mode", width: 130, type: "dropdown", options: DROPDOWN_OPTIONS["Freight Mode"], apiField: "freightMode" },

  // References
  { key: "containerNumber", title: "Container Number", width: 150, type: "text", readonly: true, apiField: "containerNumber" },
  { key: "sealNumber", title: "Seal Number", width: 140, type: "text", readonly: true, apiField: "sealNumber" },
  { key: "typeOfPackages", title: "Type Of Packages", width: 150, type: "text", readonly: true, apiField: "typeOfPackages" },
  { key: "serviceName", title: "Service Name", width: 150, type: "text", apiField: "serviceName" },
  { key: "invoicingStatus", title: "Invoicing Status", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Invoicing Status"], apiField: "invoicingStatus" },
  { key: "personalReference", title: "Personal Reference", width: 150, type: "text", apiField: "personalReference" },
  { key: "bookingNumber", title: "Booking Number", width: 140, type: "text", apiField: "bookingNumber" },
  { key: "loadType", title: "Load Type", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Load Type"], apiField: "loadType" },
  { key: "tradeDirection", title: "Trade Direction", width: 120, type: "dropdown", options: DROPDOWN_OPTIONS["Trade Direction"], apiField: "tradeDirection" },

  // Agents
  { key: "agent", title: "Agent", width: 130, type: "text", apiField: "agent" },
  { key: "agentPic", title: "Agent's PIC", width: 170, type: "text", apiField: "agentPic" },
  { key: "shippingLine", title: "Shipping line / Coloader", width: 180, type: "text", apiField: "shippingLine" },
  { key: "serviceType", title: "Service Type", width: 160, type: "dropdown", options: DROPDOWN_OPTIONS["Service Type"], apiField: "serviceType" },
  { key: "incotermOrigin", title: "Incoterm Origin", width: 120, type: "dropdown", options: DROPDOWN_OPTIONS["Incoterm Origin"], apiField: "incotermOrigin" },
  { key: "incotermDestination", title: "Incoterm Dest.", width: 120, type: "dropdown", options: DROPDOWN_OPTIONS["Incoterm Destination"], apiField: "incotermDestination" },
  { key: "insurance", title: "Insurance", width: 100, type: "dropdown", options: DROPDOWN_OPTIONS["Insurance"], apiField: "insurance" },

  // Dates
  { key: "cargoReadinessDate", title: "Cargo Readiness Date", width: 140, type: "date", apiField: "cargoReadinessDate" },
  { key: "pickupDate", title: "Pickup Date", width: 110, type: "date", apiField: "pickupDate" },
  { key: "pickupTime", title: "Pickup Time", width: 110, type: "date", apiField: "pickupTime" },
  { key: "closingDate", title: "Closing Date", width: 110, type: "date", apiField: "closingDate" },
  { key: "estimatedDeparture", title: "Estimated Departure", width: 130, type: "date", apiField: "estimatedDeparture" },
  { key: "estimatedDepartureWeek", title: "Estimated Departure Week", width: 120, type: "computed", readonly: true },
  { key: "estimatedArrival", title: "Estimated Arrival", width: 130, type: "date", apiField: "estimatedArrival" },
  { key: "estimatedArrivalWeek", title: "Estimated Arrival Week", width: 120, type: "computed", readonly: true },
  { key: "actualDeparture", title: "Actual Departure", width: 130, type: "date", apiField: "actualDeparture" },
  { key: "actualDepartureWeek", title: "Actual Departure Week", width: 120, type: "computed", readonly: true },
  { key: "actualArrival", title: "Actual Arrival", width: 130, type: "date", apiField: "actualArrival" },
  { key: "actualArrivalWeek", title: "Actual Arrival Week", width: 120, type: "computed", readonly: true },
  { key: "etaWarehouse", title: "ETA Warehouse/HUB", width: 140, type: "date", apiField: "etaWarehouse" },
  { key: "plannedDeliveryDate", title: "Planned Delivery Date", width: 140, type: "date", apiField: "plannedDeliveryDate" },
  { key: "plannedDeliveryTime", title: "Planned Delivery Time", width: 140, type: "date", apiField: "plannedDeliveryTime" },
  { key: "cargoOrigin", title: "Cargo Origin", width: 130, type: "text", apiField: "cargoOrigin" },
  { key: "origin", title: "Origin", width: 130, type: "text", apiField: "origin" },
  { key: "countryCode", title: "Country Code", width: 110, type: "text", apiField: "countryCode" },

  // Commercial
  { key: "commercialInvoice", title: "Commercial Invoice number(s)", width: 170, type: "text", apiField: "commercialInvoice" },
  { key: "commercialInvoiceValue", title: "Commercial Invoice Value", width: 160, type: "text", apiField: "commercialInvoiceValue" },
  { key: "hsCode", title: "HS Code", width: 110, type: "text", readonly: true, apiField: "hsCode" },
  { key: "cargoDescription", title: "Cargo Description", width: 220, type: "text", readonly: true, apiField: "cargoDescription" },
  { key: "pcs", title: "Pieces (PCS)", width: 100, type: "text", readonly: true, apiField: "pcs" },
  { key: "creditCheck", title: "Credit Check", width: 110, type: "dropdown", options: DROPDOWN_OPTIONS["Credit Check"], apiField: "creditCheck" },
  { key: "approvedBy", title: "Approved By", width: 150, type: "text", apiField: "approvedBy" },
  { key: "bookingConfirmation", title: "Booking Confirmation", width: 180, type: "dropdown", options: DROPDOWN_OPTIONS["Booking Confirmation"], apiField: "bookingConfirmation" },
  // Written by the release action on the detail page, never edited by hand.
  { key: "houseBolRelease", title: "House BoL Release", width: 200, type: "text", readonly: true, apiField: "houseBolRelease" },
  { key: "customsProcedure", title: "Customs Procedure", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Customs Procedure"], apiField: "customsProcedure" },
  { key: "equipmentDelivery", title: "Equipment Delivery/Pick-Up Address", width: 200, type: "text", apiField: "equipmentDelivery" },
  { key: "equipmentDeliveryDate", title: "Equipment Delivery/Pick-Up Date", width: 180, type: "date", apiField: "equipmentDeliveryDate" },
  { key: "supplierPic", title: "Supplier's PIC", width: 170, type: "text", apiField: "supplierPic" },
  { key: "vgm", title: "VGM", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["VGM"], apiField: "vgm" },
  { key: "shippingInstructions", title: "Shipping Instructions", width: 160, type: "dropdown", options: DROPDOWN_OPTIONS["Shipping Instructions"], apiField: "shippingInstructions" },
  { key: "ams", title: "AMS (if any)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["AMS (if any)"], apiField: "ams" },
  { key: "isf", title: "ISF (if any)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["ISF (if any)"], apiField: "isf" },
  { key: "bolDraft", title: "BoL draft", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["BoL draft"], apiField: "bolDraft" },

  // Switch BoL
  { key: "switchBol", title: "Switch BoL", width: 100, type: "dropdown", options: DROPDOWN_OPTIONS["Switch BoL"], apiField: "switchBol" },
  { key: "switchBolApprovedBy", title: "Switch BoL Approved By", width: 200, type: "text", apiField: "switchBolApprovedBy" },
  { key: "switchBolNumber", title: "Switch BoL Number", width: 150, type: "text", apiField: "switchBolNumber" },
  { key: "houseBolNumber", title: "House BoL Number", width: 140, type: "text", apiField: "houseBolNumber" },
  { key: "houseBolType", title: "House BoL Type", width: 120, type: "dropdown", options: DROPDOWN_OPTIONS["House BoL Type"], apiField: "houseBolType" },
  { key: "masterBolNumber", title: "Master BoL Number", width: 140, type: "text", apiField: "masterBolNumber" },
  { key: "masterBolType", title: "Master BoL Type", width: 120, type: "dropdown", options: DROPDOWN_OPTIONS["Master BoL Type"], apiField: "masterBolType" },
  { key: "vessel", title: "Vessel", width: 140, type: "text", apiField: "vessel" },
  { key: "voyage", title: "Voyage", width: 90, type: "text", apiField: "voyage" },

  // Containers
  { key: "containerCount1", title: "Amount Of Containers (1)", width: 140, type: "text", apiField: "containerCount1" },
  { key: "containerLength1", title: "Container's Length (1)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Length (1)"], apiField: "containerLength1" },
  { key: "containerType1", title: "Container's Type (1)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Type (1)"], apiField: "containerType1" },
  { key: "containerCount2", title: "Amount Of Containers (2)", width: 140, type: "text", apiField: "containerCount2" },
  { key: "containerLength2", title: "Container's Length (2)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Length (2)"], apiField: "containerLength2" },
  { key: "containerType2", title: "Container's Type (2)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Type (2)"], apiField: "containerType2" },
  { key: "containerCount3", title: "Amount Of Containers (3)", width: 140, type: "text", apiField: "containerCount3" },
  { key: "containerLength3", title: "Container's Length (3)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Length (3)"], apiField: "containerLength3" },
  { key: "containerType3", title: "Container's Type (3)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Type (3)"], apiField: "containerType3" },
  { key: "containerCount4", title: "Amount Of Containers (4)", width: 140, type: "text", apiField: "containerCount4" },
  { key: "containerLength4", title: "Container's Length (4)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Length (4)"], apiField: "containerLength4" },
  { key: "containerType4", title: "Container's Type (4)", width: 140, type: "dropdown", options: DROPDOWN_OPTIONS["Container's Type (4)"], apiField: "containerType4" },

  // Computed columns
  { key: "teu", title: "TEU", width: 70, type: "computed", readonly: true },
  // Data carrier for the dimension-derived computed columns (popup type is
  // hidden from every table/picker). Dimension rows live in cargo_dimension.
  { key: "dimensions", title: "Dimensions", width: 180, type: "popup", apiField: "cargoDimensions" },
  // Read-only projections computed by the backend from containers + cargo lines
  { key: "containerTypeSummary", title: "Container Type", width: 150, type: "text", readonly: true, apiField: "containerTypeSummary" },
  { key: "totalTeu", title: "Total TEU", width: 90, type: "text", readonly: true, apiField: "totalTeu" },
  { key: "totalGrossWeightKg", title: "Total Gross Weight (kg)", width: 160, type: "text", readonly: true, apiField: "totalGrossWeightKg" },
  { key: "totalVolumeM3", title: "Total Volume (m³)", width: 140, type: "text", readonly: true, apiField: "totalVolumeM3" },
  { key: "civByCurrency", title: "CIV By Currency", width: 170, type: "text", readonly: true, apiField: "civByCurrency" },
  { key: "totalWeightTons", title: "Total Weight In Tons", width: 140, type: "computed", readonly: true, apiField: "totalWeightTons" },
  { key: "totalVolumeCbm", title: "Total Volume In CBM", width: 140, type: "computed", readonly: true, apiField: "totalVolumeCbm" },
  { key: "freightTon", title: "Freight Ton", width: 110, type: "computed", readonly: true },
  { key: "surface", title: "Surface", width: 100, type: "computed", readonly: true },

  // Quote
  { key: "salesNumber", title: "Sales Number", width: 140, type: "text", apiField: "salesNumber" },
  { key: "selling", title: "Total Selling Costs", width: 140, type: "text", apiField: "selling" },
  { key: "buying", title: "Total Buying Costs", width: 140, type: "text", apiField: "buying" },
  { key: "profit", title: "Profit", width: 120, type: "computed", readonly: true },
  { key: "quoteValidity", title: "Quote Validity", width: 120, type: "date", apiField: "quoteValidity" },
  { key: "validityStatus", title: "Validity Status", width: 110, type: "dropdown", options: DROPDOWN_OPTIONS["Validity Status"], apiField: "validityStatus" },

  // Misc
  { key: "claim", title: "Claim", width: 100, type: "dropdown", options: DROPDOWN_OPTIONS["Claim"], apiField: "claim" },
  { key: "createdBy", title: "Created by", width: 210, type: "text", readonly: true, apiField: "createdBy" },
];

// Column key lookup for quick access
export const COLUMN_MAP = new Map(COLUMNS.map((col) => [col.key, col]));

// Columns that can never be hidden or removed (Internal Reference, Master job).
// Kept first, in config order, regardless of the user's selection/templates.
export const FIXED_COLUMN_KEYS = COLUMNS.filter((c) => c.fixed).map((c) => c.key);
const FIXED_KEY_SET = new Set(FIXED_COLUMN_KEYS);

export function isFixedColumn(key: string): boolean {
  return FIXED_KEY_SET.has(key);
}

// Force the fixed columns to always be present and first, preserving the rest.
export function withFixedColumns(keys: string[]): string[] {
  return [...FIXED_COLUMN_KEYS, ...keys.filter((k) => !FIXED_KEY_SET.has(k))];
}

// ─── Field Value Helpers ──────────────────────────────────────────────

// API fields that map directly to ShipmentItem properties
const API_FIELD_KEYS = new Set(
  COLUMNS.filter((c) => c.apiField).map((c) => c.key)
);

export function isApiField(key: string): boolean {
  return API_FIELD_KEYS.has(key);
}

export function getApiFieldName(key: string): string {
  const col = COLUMN_MAP.get(key);
  return col?.apiField || key;
}

// ─── Conditional Formatting ───────────────────────────────────────────

export interface CellStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: number;
}

export function parseDateMMDDYY(dateStr: string): Date | null {
  if (!dateStr) return null;
  // ISO "YYYY-MM-DD" (current storage format)
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(parseInt(iso[1]!, 10), parseInt(iso[2]!, 10) - 1, parseInt(iso[3]!, 10));
  // Legacy "MM/DD/YY"
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0]!, 10);
  const day = parseInt(parts[1]!, 10);
  const year = 2000 + parseInt(parts[2]!, 10);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

function isDateInPast(dateStr: string): boolean {
  const d = parseDateMMDDYY(dateStr);
  if (!d) return false;
  return d.getTime() < Date.now();
}

export function getRowConditionalStyle(rowData: Record<string, string>): CellStyle | null {
  const hblType = rowData["houseBolType"] || "";
  const mblType = rowData["masterBolType"] || "";

  // OBL only recolors the whole row's TEXT red — it does NOT override cell backgrounds,
  // so the per-column conditional coloring keeps working underneath.
  if (hblType === "OBL" || mblType === "OBL") {
    return { color: "#b91c1c" };
  }
  return null;
}

export function getCellConditionalStyle(
  key: string,
  value: string,
  rowData: Record<string, string>,
): CellStyle | null {
  // Date columns in past → green
  const dateFieldsForPastCheck = [
    "cargoReadinessDate", "closingDate", "estimatedDeparture",
    "estimatedArrival", "etaWarehouse", "plannedDeliveryDate",
  ];
  if (dateFieldsForPastCheck.includes(key) && value && isDateInPast(value)) {
    return { backgroundColor: "rgba(34, 197, 94, 0.15)", fontWeight: 700 };
  }
  // Pickup date/time linked check
  if ((key === "pickupDate" || key === "pickupTime") && rowData["pickupDate"] && isDateInPast(rowData["pickupDate"])) {
    return { backgroundColor: "rgba(34, 197, 94, 0.15)", fontWeight: 700 };
  }

  // House/Master BoL Type colors
  if ((key === "houseBolType" || key === "masterBolType") && value === "OBL") {
    return { backgroundColor: "rgba(251, 146, 60, 0.2)" };
  }
  if ((key === "houseBolType" || key === "masterBolType") && (value === "SWB" || value === "Telex")) {
    return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
  }

  // Department → Internal Reference color
  if (key === "jobNumber") {
    const dept = rowData["department"] || "";
    if (dept === "Operation Department") return { color: "#14b8a6" };
    if (dept === "Custom Department") return { backgroundColor: "rgba(202, 138, 4, 0.12)", color: "#ca8a04" };
    if (dept === "Administration Department") return { color: "#9e9e9e" };
    if (dept === "Road Department") return { color: "#3b82f6" };
  }

  // Insurance
  if (key === "insurance") {
    if (value === "Yes") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    if (value === "Pending") return { backgroundColor: "rgba(234, 179, 8, 0.15)" };
  }

  // Booking Confirmation — pending until the carrier confirms
  if (key === "bookingConfirmation") {
    if (value === "Received") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    if (value === "Pending") return { backgroundColor: "rgba(244, 63, 94, 0.12)" };
  }

  // Claim — an open claim is a problem (red), no claim is clean (green)
  if (key === "claim") {
    if (value === "Yes") return { backgroundColor: "rgba(244, 63, 94, 0.15)" };
    if (value === "No") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
  }

  // Credit Check
  if (key === "creditCheck") {
    if (value === "Green") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    if (value === "Yellow") return { backgroundColor: "rgba(234, 179, 8, 0.15)" };
    if (value === "Red") return { backgroundColor: "rgba(244, 63, 94, 0.15)" };
  }

  // Invoicing Status — Invoiced (green), Not Invoiced (red)
  if (key === "invoicingStatus") {
    if (value === "Invoiced") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    if (value === "Not Invoiced") return { backgroundColor: "rgba(244, 63, 94, 0.15)" };
  }

  // Customs Status
  if (key === "customsStatus") {
    if (value === "Waiting For Commercial Paperwork") return { backgroundColor: "rgba(244, 63, 94, 0.12)" };
    if (value === "Paperwork Verification Pending" || value === "Under Customs Clearance") return { backgroundColor: "rgba(234, 179, 8, 0.12)" };
    if (value === "Paperwork Verified" || value === "Customs Cleared/Released") return { backgroundColor: "rgba(34, 197, 94, 0.12)" };
  }

  // Required-fill fields: red when blank, green when filled
  const requiredFillFields = ["commercialInvoice", "commercialInvoiceValue", "hsCode", "cargoDescription"];
  if (requiredFillFields.includes(key)) {
    if (!value || value === "—") return { backgroundColor: "rgba(244, 63, 94, 0.12)" };
    return { backgroundColor: "rgba(34, 197, 94, 0.12)" };
  }

  // Shipping Instructions — 3-state: Not Queried (red), Not Received (orange), Confirmed (green)
  if (key === "shippingInstructions") {
    if (value === "Confirmed" || value === "Confirmed (Green)") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    if (value === "Not Received" || value === "Pending (Red)" || value === "Pending") return { backgroundColor: "rgba(249, 115, 22, 0.15)" };
    if (value === "Not Queried") return { backgroundColor: "rgba(244, 63, 94, 0.12)" };
    return null;
  }

  // BoL draft — 3-state: Not Processed (red), Waiting for approval (orange), Approved (green)
  if (key === "bolDraft") {
    if (value === "Approved" || value === "Confirmed (Green)") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    if (value === "Waiting for approval" || value === "Pending (Red)" || value === "Pending") return { backgroundColor: "rgba(249, 115, 22, 0.15)" };
    if (value === "Not Processed") return { backgroundColor: "rgba(244, 63, 94, 0.12)" };
    return null;
  }

  // Triple-state compliance fields (VGM/AMS/ISF)
  const tripleStateFields = ["vgm", "ams", "isf"];
  if (tripleStateFields.includes(key)) {
    if (value === "Confirmed (Green)") return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    // Handed over to the customer — neither done nor our pending item.
    if (value === "Customer") return { backgroundColor: "rgba(249, 115, 22, 0.15)" };
    if (value === "Not Applicable") return { backgroundColor: "rgba(156, 163, 175, 0.15)", color: "#9ca3af" };
    return { backgroundColor: "rgba(244, 63, 94, 0.12)" };
  }

  // Shipment Status cell coloring
  if (key === "status" && value) {
    if (value.includes("Booking Confirmation Pending")) return { backgroundColor: "rgba(244, 63, 94, 0.12)" };
    if (value === "All Done - Waiting To Be Shipped [IMP]" || value === "Pick Up Date Pending From Customer [EXP]") return { backgroundColor: "rgba(234, 179, 8, 0.12)" };
    if (value === "Arrival Notice Sent - Waiting For Instructions [IMP]") return { backgroundColor: "rgba(156, 163, 175, 0.12)" };
    if (value.includes("Pre-Alert Received") || value.includes("Customs Clearance Pending") || value.includes("Loaded - Customs Clearance")) return { backgroundColor: "rgba(244, 114, 182, 0.12)" };
    if (value.includes("Booked For Further Transport") || value.includes("Delivery Date Pending") || value === "All Done - Waiting To Be Shipped [EXP]" || value === "Pre-Alert Sent [EXP]") return { backgroundColor: "rgba(34, 197, 94, 0.08)" };
    if (value.includes("Billing [")) return { backgroundColor: "rgba(34, 197, 94, 0.15)" };
    if (value.includes("Billed [")) return { backgroundColor: "rgba(234, 179, 8, 0.12)" };
  }

  // Sales Number validity
  if (key === "salesNumber") {
    const validityStatus = rowData["validityStatus"] || "";
    if (validityStatus === "Ok") return { backgroundColor: "rgba(34, 197, 94, 0.12)" };
    if (validityStatus === "Check") return { backgroundColor: "rgba(234, 179, 8, 0.12)" };
  }

  // Booking Number disabled for Customs Clearance load type
  if (key === "bookingNumber" && rowData["loadType"] === "Customs Clearance") {
    return { backgroundColor: "rgba(156, 163, 175, 0.1)" };
  }

  return null;
}

// ─── Computed Column Calculators ──────────────────────────────────────

// Shape of a cargo_dimension row as served by the API (volume per piece is
// always derived from L×W×H, never stored).
export interface DimensionRow {
  pieces: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightPerPcKg: string;
}

export function computeDimensionTotals(dimensions: unknown): {
  weightKg: number;
  volumeCbm: number;
  surface: number;
} {
  if (!dimensions) return { weightKg: 0, volumeCbm: 0, surface: 0 };
  try {
    const rows: DimensionRow[] = Array.isArray(dimensions) ? dimensions : JSON.parse(String(dimensions));
    let weightKg = 0, volumeCbm = 0, surface = 0;
    for (const r of rows) {
      const pieces = parseFloat(r.pieces || "0") || 0;
      const L = parseFloat(r.lengthCm || "0") || 0;
      const W = parseFloat(r.widthCm || "0") || 0;
      const H = parseFloat(r.heightCm || "0") || 0;
      const wPiece = parseFloat(r.weightPerPcKg || "0") || 0;
      weightKg += pieces * wPiece;
      volumeCbm += pieces * (L * W * H) / 1_000_000;
      surface += pieces * (L * W) / 10_000;
    }
    return { weightKg, volumeCbm, surface };
  } catch {
    return { weightKg: 0, volumeCbm: 0, surface: 0 };
  }
}

// ISO-8601 week number (weeks start Monday; week 1 contains the year's first Thursday).
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to the Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function weekFromDate(dateStr: string): string {
  const d = parseDateMMDDYY(dateStr);
  if (!d) return "";
  return String(getISOWeek(d));
}

export function computeTEU(rowData: Record<string, string>): number {
  let teu = 0;
  for (let i = 1; i <= 4; i++) {
    const count = parseFloat(rowData[`containerCount${i}`] || "0") || 0;
    const length = parseFloat(rowData[`containerLength${i}`] || "0") || 0;
    if (count > 0 && length > 0) {
      teu += count * (length >= 40 ? 2 : 1);
    }
  }
  return teu;
}

export function getComputedValue(key: string, rowData: Record<string, string>): string {
  const dims = computeDimensionTotals(rowData["dimensions"] || "");

  switch (key) {
    case "teu": {
      // Container rows are the source of truth; the legacy count/length field
      // sets only cover shipments that predate the container table.
      if (rowData["totalTeu"]) return rowData["totalTeu"];
      const teu = computeTEU(rowData);
      return teu > 0 ? String(teu) : "";
    }
    case "totalWeightTons": {
      if (dims.weightKg > 0) return (dims.weightKg / 1000).toFixed(3);
      return rowData["totalWeightTons"] || "";
    }
    case "totalVolumeCbm": {
      if (dims.volumeCbm > 0) return dims.volumeCbm.toFixed(3);
      return rowData["totalVolumeCbm"] || "";
    }
    case "freightTon": {
      const weightTons = dims.weightKg > 0 ? dims.weightKg / 1000 : parseFloat(rowData["totalWeightTons"] || "0") || 0;
      const cbm = dims.volumeCbm > 0 ? dims.volumeCbm : parseFloat(rowData["totalVolumeCbm"] || "0") || 0;
      const wm = Math.max(weightTons, cbm);
      return wm > 0 ? wm.toFixed(3) : "";
    }
    case "surface": {
      return dims.surface > 0 ? dims.surface.toFixed(2) : "";
    }
    case "profit": {
      const selling = rowData["selling"] || "";
      const buying = rowData["buying"] || "";
      if (!selling && !buying) return "";
      const sell = parseFloat(selling) || 0;
      const buy = parseFloat(buying) || 0;
      return (sell - buy).toFixed(2);
    }
    case "shipmentsDate": {
      // Derived month: Export → ETD Estimated, Import → ETA Estimated.
      const dir = (rowData["tradeDirection"] || "").trim().toLowerCase();
      const src = dir === "export"
        ? rowData["estimatedDeparture"]
        : dir === "import"
          ? rowData["estimatedArrival"]
          : "";
      const d = parseDateMMDDYY(src || "");
      if (!d) return "";
      return DROPDOWN_OPTIONS["Shipments Date"]?.[d.getMonth()] ?? "";
    }
    case "estimatedDepartureWeek":
      return weekFromDate(rowData["estimatedDeparture"] || "");
    case "estimatedArrivalWeek":
      return weekFromDate(rowData["estimatedArrival"] || "");
    case "actualDepartureWeek":
      return weekFromDate(rowData["actualDeparture"] || "");
    case "actualArrivalWeek":
      return weekFromDate(rowData["actualArrival"] || "");
    default:
      return "";
  }
}

// ─── Status Badge Colors ──────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  "Billed [IMP]": "#4CAF50",
  "Billed [EXP]": "#4CAF50",
  "Delivery Date Pending From Customer [IMP]": "#FFC107",
  "Pre-Alert Received - Further Transport To Be Booked [IMP]": "#FF9800",
  "Booked For Further Transport [IMP]": "#FFD54F",
  "All Done - Waiting To Be Shipped [IMP]": "#2196F3",
  "All Done - Waiting To Be Shipped [EXP]": "#2196F3",
  "Booking Confirmation Pending [IMP]": "#F44336",
  "Booking Confirmation Pending [EXP]": "#F44336",
  "Pick Up Date Pending From Customer [EXP]": "#CE93D8",
  "Billing [IMP]": "#66BB6A",
  "Billing [EXP]": "#66BB6A",
  "Arrival Notice Sent - Waiting For Instructions [IMP]": "#9E9E9E",
  "Customs Clearance Pending [IMP]": "#F48FB1",
  "Loaded - Customs Clearance In Progress [EXP]": "#F48FB1",
  "Pre-Alert Sent [EXP]": "#9CCC65",
};

// ─── Helpers ──────────────────────────────────────────────────────────

export function getStatusBadgeStyle(status: string): React.CSSProperties {
  const color = STATUS_COLORS[status];
  if (!color) return {};
  return {
    backgroundColor: color + "22",
    color,
    border: `1px solid ${color}44`,
    borderRadius: "4px",
    padding: "0 5px",
    fontSize: "11px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "inline-block",
    lineHeight: "22px",
  };
}

export function getFilteredStatusOptions(tradeDirection: string): string[] {
  const allOpts = DROPDOWN_OPTIONS["Shipment Status"]!;
  if (tradeDirection === "Import") return allOpts.filter((o) => o.includes("[IMP]") || o === "---");
  if (tradeDirection === "Export") return allOpts.filter((o) => o.includes("[EXP]") || o === "---");
  return allOpts;
}
