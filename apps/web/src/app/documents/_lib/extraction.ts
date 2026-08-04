import type { controllers, interfaces } from "@/lib/api/client";
import type { ShipmentItem } from "@/hooks/useShipments";
import { CURRENCIES } from "@/lib/enums";
import { extractContainerNumbers } from "@/lib/container";

export type Destination = "shipment" | "invoicing" | "quote" | "masterjob";
export type InputMode = "file" | "text";
export type Step = "upload" | "extracting" | "review" | "committed";
export type TargetMode = "existing" | "new";

export interface ExtractedField {
  column: string; // extracted label as emitted by the backend
  extractedValue: string;
  existingValue: string;
  hasConflict: boolean;
  approved: boolean;
}

export interface InvoiceExtracted {
  total_amount?: string;
  currency?: string;
  vendor?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  description?: string;
  service_type?: string;
}

// Extracted label → ShipmentUpdateRequest field name.
// Labels are the ones the backend emits (apps/api/services/extraction/lib/fields.ts).
export const SHIPMENT_FIELD_MAP: Record<string, string> = {
  Shipper: "shipper",
  Consignee: "consignee",
  "Personal Reference": "personalReference",
  // "Container Number" is intentionally NOT mapped to a shipment field: container
  // numbers live in the `container` table, so extraction turns them into container
  // rows (see parseContainerNumbers / containerRowsFromNumbers) instead.
  "Booking Number": "bookingNumber",
  "Load Type": "loadType",
  "Shipping line / Coloader": "shippingLine",
  POL: "pol",
  POD: "pod",
  Destination: "destination",
  "HS Code": "hsCode",
  "Cargo Description": "cargoDescription",
  "House BoL Number": "houseBolNumber",
  "Master BoL Number": "masterBolNumber",
  "House BoL Type": "houseBolType",
  "Master BoL Type": "masterBolType",
  Vessel: "vessel",
  Voyage: "voyage",
  "CNTR count [1]": "containerCount1",
  "CNTR length [1]": "containerLength1",
  "CNTR type [1]": "containerType1",
  "CNTR count [2]": "containerCount2",
  "CNTR length [2]": "containerLength2",
  "CNTR type [2]": "containerType2",
  "CNTR count [3]": "containerCount3",
  "CNTR length [3]": "containerLength3",
  "CNTR type [3]": "containerType3",
  "CNTR count [4]": "containerCount4",
  "CNTR length [4]": "containerLength4",
  "CNTR type [4]": "containerType4",
  PCS: "pcs",
  "Total Weight In Tons": "totalWeightTons",
  "Total Volume In CBM": "totalVolumeCbm",
  "Cargo Origin": "cargoOrigin",
  "Country code": "countryCode",
  Origin: "origin",
  "Estimated Departure": "estimatedDeparture",
  "Estimated Arrival": "estimatedArrival",
  "Trade Direction": "tradeDirection",
  Agent: "agent",
  "Incoterm Origin": "incotermOrigin",
  "Incoterm Destination": "incotermDestination",
  "Commercial Invoice Value": "commercialInvoiceValue",
  "Freight Mode": "freightMode",
};

export const COST_CATEGORY_OPTIONS = [
  { value: "freight", label: "Freight" },
  { value: "collection", label: "Collection / Delivery" },
  { value: "locals", label: "Locals" },
  { value: "others", label: "Others" },
  { value: "insurance", label: "Insurance" },
  { value: "customs", label: "Customs clearance" },
] as const;

export const INVOICE_FIELD_LABELS: Record<string, string> = {
  total_amount: "Total Amount",
  currency: "Currency",
  vendor: "Vendor",
  invoice_number: "Invoice Number",
  invoice_date: "Invoice Date",
  due_date: "Due Date",
  description: "Description",
  service_type: "Suggested Category",
};

// The vision model still returns legacy codes (FCL/LCL/IMP/EXP). Translate them
// into the English dropdown values used across the app, and derive Freight Mode
// when the extracted data implies a transport mode but the model left it blank.
export function normalizeExtracted(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...raw };

  const lt = (out["Load Type"] || "").trim().toUpperCase();
  if (lt === "FCL") out["Load Type"] = "Full Load";
  else if (lt === "LCL") out["Load Type"] = "Consolidation";
  else if (lt === "CUSTOMS" || lt === "CUSTOMS CLEARANCE") out["Load Type"] = "Customs Clearance";

  const td = (out["Trade Direction"] || "").trim().toUpperCase();
  if (td === "IMP" || td === "IMPORT") out["Trade Direction"] = "Import";
  else if (td === "EXP" || td === "EXPORT") out["Trade Direction"] = "Export";

  if (!out["Freight Mode"]) {
    const hasVessel = !!out["Vessel"];
    const hasContainer = !!(out["Container Number"] || out["CNTR count [1]"] || out["CNTR length [1]"]);
    if (hasVessel || hasContainer) out["Freight Mode"] = "Sea Freight";
  }

  return out;
}

// Next "CZ00000001"-style job number, considering both persisted shipments and
// numbers already assigned earlier in the same session (batch creation).
export function nextCzNumber(shipments: ShipmentItem[], sessionAssigned: string[] = []): string {
  let max = 0;
  const consider = (jn: string | null | undefined) => {
    if (jn && jn.startsWith("CZ") && !jn.startsWith("CZQ")) {
      const num = parseInt(jn.substring(2), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  };
  for (const s of shipments) consider(s.jobNumber);
  for (const jn of sessionAssigned) consider(jn);
  return `CZ${String(max + 1).padStart(8, "0")}`;
}

export function nextMczNumber(shipments: ShipmentItem[]): string {
  let max = 0;
  for (const s of shipments) {
    const mn = s.masterJobMczNumber;
    if (mn && mn.startsWith("MCZ")) {
      const num = parseInt(mn.substring(3), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `MCZ${String(max + 1).padStart(8, "0")}`;
}

export function existingMczNumbers(shipments: ShipmentItem[]): string[] {
  const set = new Set<string>();
  for (const s of shipments) {
    const mn = s.masterJobMczNumber;
    if (mn && mn.startsWith("MCZ")) set.add(mn);
  }
  return Array.from(set).sort();
}

// A document's "Container Number" field can hold several numbers and use spaces or
// hyphens ("MSMU 272727-7"). Strip separators and pull out each canonical
// 4-letter+7-digit number so they're stored uniformly (e.g. → "MSMU2727277").
export function parseContainerNumbers(raw?: string): string[] {
  return extractContainerNumbers(raw);
}

// Build container rows from parsed numbers (only the number is known from extraction;
// seal/type/weight/etc. are filled in later in the Container Details tab).
export function containerRowsFromNumbers(numbers: string[]): interfaces.ContainerLine[] {
  return numbers.map((containerNumber) => ({
    containerNumber,
    sealNumber: "",
    type: "",
    teu: "",
    packages: "",
    packageType: "",
    grossWeight: "",
    volume: "",
  }));
}

// Map approved {label: value} pairs to a ShipmentUpdateRequest, dropping unknown
// labels and empty values.
export function toShipmentUpdate(labelValues: Record<string, string>): controllers.ShipmentUpdateRequest {
  const out: Record<string, string> = {};
  for (const [label, value] of Object.entries(labelValues)) {
    const apiField = SHIPMENT_FIELD_MAP[label];
    if (apiField && value) out[apiField] = value;
  }
  return out as controllers.ShipmentUpdateRequest;
}

export function normalizeCurrency(raw?: string): string {
  const c = (raw || "").toUpperCase();
  return (CURRENCIES as readonly string[]).includes(c) ? c : "CZK";
}

export function createdByStamp(email: string | undefined, fallback = "Document Reading"): string {
  const now = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
  return `${now} — ${email || fallback}`;
}

export function baseCreatePayload(jobNumber: string, createdBy: string): controllers.ShipmentCreateRequest {
  return {
    jobNumber,
    tradeDirection: "Import",
    freightMode: "Sea Freight",
    department: "Operation Department",
    status: "Booking Confirmation Pending [IMP]",
    customsStatus: "Waiting For Commercial Paperwork",
    createdBy,
  };
}

// Build the review field list for shipment/quote destinations, detecting conflicts
// against a lookup of existing values keyed by extracted label.
export function buildFields(
  normalized: Record<string, string>,
  existingFor: (label: string) => string,
): ExtractedField[] {
  return Object.entries(normalized).map(([column, extractedValue]) => {
    const existingValue = existingFor(column);
    const hasConflict = existingValue !== "" && existingValue !== extractedValue;
    return { column, extractedValue, existingValue, hasConflict, approved: !hasConflict };
  });
}
