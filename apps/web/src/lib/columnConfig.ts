export type ColumnType = "text" | "dropdown" | "date";

export const DROPDOWN_OPTIONS: Record<string, string[]> = {
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
    "Booking Confirmation Pending [EXP]",
    "Pick Up Date Pending From Customer [EXP]",
    "All Done - Waiting To Be Shipped [EXP]",
    "Loaded - Customs Clearance In Progress [EXP]",
    "Pre-Alert Sent [EXP]",
    "Billing [EXP]",
    "Billed [EXP]",
  ],
  "Load Type": ["FCL", "LCL"],
  "Trade Direction": ["Import", "Export"],
  "Freight Mode": ["Air Freight", "Sea Freight", "Rail Freight", "Road Freight"],
  "Incoterm Origin": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"],
  "Incoterm Destination": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"],
  "House BoL Type": ["OBL", "SWB", "Telex", "OHBL ok", "Direct MBL"],
  "Master BoL Type": ["OBL", "SWB", "Telex", "OMBL ok"],
};

export const DATE_COLUMNS = new Set([
  "estimatedDeparture", "estimatedArrival",
]);

// Maps display column name to the shipment field key
export interface ColumnDef {
  key: string;
  title: string;
  width: number;
  type: ColumnType;
  options?: string[];
  fixed?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { key: "jobNumber", title: "Internal Reference", width: 120, type: "text", fixed: true },
  { key: "shipper", title: "Shipper", width: 160, type: "text" },
  { key: "consignee", title: "Consignee", width: 160, type: "text" },
  { key: "pol", title: "POL", width: 100, type: "text" },
  { key: "pod", title: "POD", width: 100, type: "text" },
  { key: "destination", title: "Destination", width: 120, type: "text" },
  { key: "customsStatus", title: "Customs Status", width: 180, type: "dropdown", options: DROPDOWN_OPTIONS["Customs Status"] },
  { key: "status", title: "Shipment Status", width: 300, type: "dropdown", options: DROPDOWN_OPTIONS["Shipment Status"] },
  { key: "tradeDirection", title: "Trade Direction", width: 100, type: "dropdown", options: DROPDOWN_OPTIONS["Trade Direction"] },
  { key: "loadType", title: "Load Type", width: 80, type: "dropdown", options: DROPDOWN_OPTIONS["Load Type"] },
  { key: "shippingLine", title: "Shipping Line", width: 150, type: "text" },
  { key: "containerNumber", title: "Container Number", width: 140, type: "text" },
  { key: "bookingNumber", title: "Booking Number", width: 130, type: "text" },
  { key: "personalReference", title: "Personal Reference", width: 140, type: "text" },
  { key: "agent", title: "Agent", width: 120, type: "text" },
  { key: "vessel", title: "Vessel", width: 130, type: "text" },
  { key: "voyage", title: "Voyage", width: 80, type: "text" },
  { key: "estimatedDeparture", title: "ETD", width: 100, type: "date" },
  { key: "estimatedArrival", title: "ETA", width: 100, type: "date" },
  { key: "incotermOrigin", title: "Incoterm Origin", width: 110, type: "dropdown", options: DROPDOWN_OPTIONS["Incoterm Origin"] },
  { key: "incotermDestination", title: "Incoterm Dest.", width: 110, type: "dropdown", options: DROPDOWN_OPTIONS["Incoterm Destination"] },
  { key: "hsCode", title: "HS Code", width: 100, type: "text" },
  { key: "cargoDescription", title: "Cargo Description", width: 180, type: "text" },
  { key: "houseBolNumber", title: "House BoL #", width: 130, type: "text" },
  { key: "masterBolNumber", title: "Master BoL #", width: 130, type: "text" },
];
