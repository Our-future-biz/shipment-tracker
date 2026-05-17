// Column configuration: types, dropdown options, conditional formatting rules
// All column names updated per system-1.xlsx (task C)
// All dropdown values updated per system-2.xlsx (task D)

export type ColumnType = "text" | "dropdown" | "date" | "checkbox";

export interface ColumnDef {
  header: string;
  type: ColumnType;
  options?: string[];
  width?: number; // min-width in px
}

// Dropdown option definitions (NEW ENGLISH values per system-2.xlsx)
export const DROPDOWN_OPTIONS: Record<string, string[]> = {
  "Shipments Date": [
    "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
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
    // Import statuses
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
    // Export statuses (incl. Pre-Alert Sent from task DD)
    "Booking Confirmation Pending [EXP]",
    "Pick Up Date Pending From Customer [EXP]",
    "All Done - Waiting To Be Shipped [EXP]",
    "Loaded - Customs Clearance In Progress [EXP]",
    "Pre-Alert Sent [EXP]",
    "Billing [EXP]",
    "Billed [EXP]",
  ],
  // Load Type with new Customs Clearance option
  "Load Type": ["Full Load", "Consolidation", "Customs Clearance"],
  "Trade Direction": ["Import", "Export"],
  // Freight Mode (was TO DO date, now dropdown per system-2)
  "Freight Mode": ["Air Freight", "Sea Freight", "Rail Freight", "Road Freight"],
  // Service Type — PROCURA/CONTRACTOR removed (task W)
  "Service Type": ["Direct", "In-Direct/Nominated"],
  "Incoterm Origin": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"],
  "Incoterm Destination": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"],
  // Insurance — Hold → Pending
  "Insurance": ["Yes", "Pending", "No"],
  // Credit Check — Blue removed (task H)
  "Credit Check": ["Green", "Yellow", "Red"],
  "Validity Status": ["Ok", "Check"],
  "Switch BoL": ["YES", "NO"],
  // Approved-By fields behave as text (email/name)
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
  // Compliance flags (task I) — red/not-applicable/green (default red)
  "Shipping Instructions": ["Pending (Red)", "Confirmed (Green)", "Not Applicable"],
  "VGM": ["Pending (Red)", "Confirmed (Green)", "Not Applicable"],
  "AMS (if any)": ["Pending (Red)", "Confirmed (Green)", "Not Applicable"],
  "ISF (if any)": ["Pending (Red)", "Confirmed (Green)", "Not Applicable"],
  "BoL draft": ["Pending (Red)", "Confirmed (Green)", "Not Applicable"],
};

// Date columns (renamed per system-1)
export const DATE_COLUMNS = new Set([
  "Cargo Readyness Date", "Pickup Date", "Pickup Time", "Closing Date",
  "Estimated Departure", "Estimated Arrival",
  "ETA Warehouse/HUB", "Planned Delivery Date", "Planned Delivery Time",
  "Quote Validity",
]);

// Checkbox columns — Stackable was removed (task O)
export const CHECKBOX_COLUMNS = new Set<string>([]);

// Columns that display "click to open" popup instead of inline edit (task L)
export const POPUP_COLUMNS = new Set<string>(["Dimensions"]);

// Computed / read-only columns (tasks K, R, S, T — also Freight Ton)
export const COMPUTED_COLUMNS = new Set<string>([
  "TEU", "Total Weight In Tons", "Total Volume In CBM", "Freight Ton", "Surface",
]);

export function getColumnType(header: string): ColumnType {
  if (CHECKBOX_COLUMNS.has(header)) return "checkbox";
  if (DROPDOWN_OPTIONS[header]) return "dropdown";
  if (DATE_COLUMNS.has(header)) return "date";
  return "text";
}

// Task B — auto-fit widths to text content.
// Width is computed from:
//   - header text length (baseline to fit the header)
//   - longest dropdown option (if applicable)
//   - a few hand-tuned overrides for columns that hold long values
const HEADER_CHAR_PX = 8.2; // avg char width at 11px text + padding
const HEADER_PADDING = 36; // side padding + grip + sort icon

// Manual overrides where VALUES are much longer than the HEADER.
const MIN_WIDTH_OVERRIDES: Record<string, number> = {
  "Internal Reference": 140,
  "Master job": 140,
  "Created by": 210,
  "Shipper": 180,
  "Consignee": 180,
  "Customer": 180,
  "Cargo Description": 220,
  "Free Comments": 200,
  "Pickup Address": 200,
  "Delivery Address": 200,
  "Shipping line / Coloader": 180,
  "Customer's PIC": 170,
  "Customer Reference": 170,
  "Person In Charge": 180,
  "Agent's PIC": 170,
  "Supplier's PIC": 170,
  "Switch BoL Approved By": 200,
  "Booking Confirmation": 180,
  "Equipment Delivery/Pickup": 180,
  "Dimensions": 180,
};

export function getColumnWidth(header: string): number {
  // Baseline: fit the header text
  const baseHeader = Math.ceil(header.length * HEADER_CHAR_PX) + HEADER_PADDING;

  // Account for the longest dropdown option (so dropdown chevrons never truncate)
  const opts = DROPDOWN_OPTIONS[header];
  const longestOpt = opts ? Math.max(...opts.map((o) => o.length)) : 0;
  const dropdownNeed = opts ? Math.ceil(longestOpt * HEADER_CHAR_PX) + 28 : 0;

  // Apply override floor (columns whose user-entered VALUES are longer than the header)
  const override = MIN_WIDTH_OVERRIDES[header] || 0;

  // Date columns rarely need more than 110
  if (DATE_COLUMNS.has(header)) {
    return Math.max(110, baseHeader);
  }

  return Math.max(100, baseHeader, dropdownNeed, override);
}

// Conditional formatting: current date for comparison
export const REFERENCE_DATE = new Date(2026, 2, 26); // March 26, 2026

// For "Quote Validity is today" check
const REFERENCE_DATE_STR = `${String(REFERENCE_DATE.getMonth() + 1).padStart(2, "0")}/${String(REFERENCE_DATE.getDate()).padStart(2, "0")}/${String(REFERENCE_DATE.getFullYear()).slice(-2)}`;

export function parseDateMMDDYY(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const year = 2000 + parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

export function isDateInPast(dateStr: string): boolean {
  const d = parseDateMMDDYY(dateStr);
  if (!d) return false;
  return d.getTime() < REFERENCE_DATE.getTime();
}

export function isDateToday(dateStr: string): boolean {
  if (!dateStr) return false;
  return dateStr === REFERENCE_DATE_STR;
}

// ─── Cell style interface ─────────────────────────────────────────
export interface CellStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: number;
}

// ─── Row-level conditional style ──────────────────────────────────
export function getRowConditionalStyle(
  rowData: Record<string, string>
): CellStyle | null {
  const hblType = rowData["House BoL Type"] || "";
  const mblType = rowData["Master BoL Type"] || "";
  const creditCheck = rowData["Credit Check"] || "";

  if (hblType === "OBL") {
    return { backgroundColor: "var(--tint-green-soft)" };
  }
  if (mblType === "OBL") {
    return { backgroundColor: "var(--tint-green-soft)" };
  }
  if (creditCheck === "Red") {
    return { backgroundColor: "var(--tint-pink)" };
  }
  return null;
}

// ─── Cell-level conditional formatting ────────────────────────────
export function getCellConditionalStyle(
  colHeader: string,
  cellValue: string,
  rowData: Record<string, string>
): CellStyle | null {
  // Date columns in past → green bg + bold
  if (colHeader === "Cargo Readyness Date" && cellValue && isDateInPast(cellValue)) {
    return { backgroundColor: "var(--tint-green)", fontWeight: 700 };
  }
  const puDate = rowData["Pickup Date"] || "";
  if ((colHeader === "Pickup Date" || colHeader === "Pickup Time") && puDate && isDateInPast(puDate)) {
    return { backgroundColor: "var(--tint-green)", fontWeight: 700 };
  }
  if (colHeader === "Estimated Departure" && cellValue && isDateInPast(cellValue)) {
    return { backgroundColor: "var(--tint-green)", fontWeight: 700 };
  }
  if (colHeader === "Estimated Arrival" && cellValue && isDateInPast(cellValue)) {
    return { backgroundColor: "var(--tint-green)", fontWeight: 700 };
  }
  if (colHeader === "ETA Warehouse/HUB" && cellValue && isDateInPast(cellValue)) {
    return { backgroundColor: "var(--tint-green)", fontWeight: 700 };
  }
  if (colHeader === "Planned Delivery Date" && cellValue && isDateInPast(cellValue)) {
    return { backgroundColor: "var(--tint-green)", fontWeight: 700 };
  }
  if (colHeader === "Closing Date" && cellValue && isDateInPast(cellValue)) {
    return { backgroundColor: "var(--tint-green)", fontWeight: 700 };
  }

  // House/Master BoL Type colors
  if (colHeader === "House BoL Type" && cellValue === "OBL") {
    return { backgroundColor: "var(--tint-orange)" };
  }
  if (colHeader === "Master BoL Type" && cellValue === "OBL") {
    return { backgroundColor: "var(--tint-orange)" };
  }
  if (colHeader === "House BoL Type" && (cellValue === "SWB" || cellValue === "Telex")) {
    return { backgroundColor: "var(--tint-green)" };
  }
  if (colHeader === "Master BoL Type" && (cellValue === "SWB" || cellValue === "Telex")) {
    return { backgroundColor: "var(--tint-green)" };
  }

  // Department → Internal Reference column color
  if (colHeader === "Internal Reference") {
    const dept = rowData["Department"] || "";
    if (dept === "Operation Department") {
      return { color: "var(--brand-teal)" };
    }
    if (dept === "Custom Department") {
      // Mustard / dark yellow — clearly visible on both light and dark mode
      return { backgroundColor: "var(--dark-yellow-bg)", color: "var(--dark-yellow)" };
    }
    if (dept === "Administration Department") {
      return { color: "#9e9e9e" };
    }
    if (dept === "Road Department") {
      return { color: "var(--brand-blue)" };
    }
  }

  // Insurance
  if (colHeader === "Insurance" && cellValue === "Yes") {
    return { backgroundColor: "var(--tint-green)" };
  }
  if (colHeader === "Insurance" && cellValue === "Pending") {
    return { backgroundColor: "var(--tint-yellow)" };
  }

  // Credit Check (Blue removed)
  if (colHeader === "Credit Check") {
    if (cellValue === "Green") {
      return { backgroundColor: "var(--tint-green)" };
    }
    if (cellValue === "Yellow") {
      return { backgroundColor: "var(--tint-yellow)" };
    }
    if (cellValue === "Red") {
      return { backgroundColor: "var(--tint-red)" };
    }
  }

  // Customs Status cell coloring
  if (colHeader === "Customs Status") {
    if (cellValue === "Waiting For Commercial Paperwork") {
      return { backgroundColor: "var(--tint-red)" };
    }
    if (cellValue === "Paperwork Verification Pending" || cellValue === "Under Customs Clearance") {
      return { backgroundColor: "var(--tint-yellow)" };
    }
    if (cellValue === "Paperwork Verified" || cellValue === "Customs Cleared/Released") {
      return { backgroundColor: "var(--tint-green)" };
    }
  }

  // Required-fill fields: red when blank, green when filled
  const redGreenFields = ["Commercial Invoice", "Commercial Invoice Value", "HS Code", "Cargo Description"];
  if (redGreenFields.includes(colHeader)) {
    if (!cellValue || cellValue === "—") {
      return { backgroundColor: "var(--tint-red)" };
    }
    return { backgroundColor: "var(--tint-green)" };
  }

  // Task I: SI/VGM/AMS/ISF/BoL draft — 3-state coloring (red default, green ok, grey N/A)
  const tripleStateFields = ["Shipping Instructions", "VGM", "AMS (if any)", "ISF (if any)", "BoL draft"];
  if (tripleStateFields.includes(colHeader)) {
    if (cellValue === "Confirmed (Green)") {
      return { backgroundColor: "var(--tint-green)" };
    }
    if (cellValue === "Not Applicable") {
      return { backgroundColor: "var(--tint-grey)", color: "#999" };
    }
    // default / Pending (Red) / empty → red
    return { backgroundColor: "var(--tint-red)" };
  }

  // Quote Validity / Validity Status on Sales Number
  if (colHeader === "Sales Number") {
    const validityCost = rowData["Quote Validity"] || "";
    const validityStatus = rowData["Validity Status"] || "";
    if (validityStatus === "Ok") {
      return { backgroundColor: "var(--tint-green)" };
    }
    if (validityStatus && validityStatus.toLowerCase().includes("check")) {
      return { backgroundColor: "var(--tint-yellow)" };
    }
    if (validityCost && isDateToday(validityCost)) {
      return { backgroundColor: "var(--tint-green)" };
    }
  }

  // Trade Direction = 'Customs Clearance' Load Type → gray on Booking Number
  if (colHeader === "Booking Number") {
    const loadType = rowData["Load Type"] || "";
    if (loadType === "Customs Clearance") {
      return { backgroundColor: "var(--tint-grey)" };
    }
  }

  // Shipment Status coloring (new English names)
  if (colHeader === "Shipment Status" && cellValue) {
    if (cellValue === "Booking Confirmation Pending [IMP]" || cellValue === "Booking Confirmation Pending [EXP]") {
      return { backgroundColor: "var(--tint-red)" };
    }
    if (cellValue === "All Done - Waiting To Be Shipped [IMP]" || cellValue === "Pick Up Date Pending From Customer [EXP]") {
      return { backgroundColor: "var(--tint-yellow)" };
    }
    if (cellValue === "Arrival Notice Sent - Waiting For Instructions [IMP]") {
      return { backgroundColor: "var(--tint-grey)" };
    }
    if (cellValue === "Pre-Alert Received - Further Transport To Be Booked [IMP]") {
      return { backgroundColor: "var(--tint-pink)" };
    }
    if (
      cellValue === "Booked For Further Transport [IMP]" ||
      cellValue === "Delivery Date Pending From Customer [IMP]" ||
      cellValue === "All Done - Waiting To Be Shipped [EXP]"
    ) {
      return { backgroundColor: "var(--tint-green-soft)" };
    }
    if (cellValue === "Customs Clearance Pending [IMP]" || cellValue === "Loaded - Customs Clearance In Progress [EXP]") {
      return { backgroundColor: "var(--tint-pink)" };
    }
    if (cellValue === "Pre-Alert Sent [EXP]") {
      return { backgroundColor: "var(--tint-green-soft)" };
    }
    if (cellValue === "Billing [IMP]" || cellValue === "Billing [EXP]") {
      return { backgroundColor: "var(--tint-green)" };
    }
    if (cellValue === "Billed [IMP]" || cellValue === "Billed [EXP]") {
      return { backgroundColor: "var(--tint-yellow)" };
    }
  }

  return null;
}
