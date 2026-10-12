import type { controllers, interfaces } from "@/lib/api/client";
import type { ShipmentItem } from "@/hooks/useShipments";
import { CURRENCIES } from "@/lib/enums";
import { extractContainerNumbers } from "@/lib/container";
import { CONTAINER_TYPES, PACK_TYPES } from "@/lib/cargo";
import { DROPDOWN_OPTIONS } from "@/lib/columnConfig";

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
  "Type Of Packages": "typeOfPackages",
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
  // Documents also write "FCL/FCL", "LCL/FCL" (origin/destination); the origin side decides.
  if (lt.startsWith("FCL")) out["Load Type"] = "Full Load";
  else if (lt.startsWith("LCL")) out["Load Type"] = "Consolidation";
  else if (lt === "CUSTOMS" || lt === "CUSTOMS CLEARANCE") out["Load Type"] = "Customs Clearance";

  const td = (out["Trade Direction"] || "").trim().toUpperCase();
  if (td === "IMP" || td === "IMPORT") out["Trade Direction"] = "Import";
  else if (td === "EXP" || td === "EXPORT") out["Trade Direction"] = "Export";

  if (out["Type Of Packages"]) out["Type Of Packages"] = normalizePackageType(out["Type Of Packages"]);

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

// `masterJobs` are the MCZ numbers of every master job on the server: one created
// on the Master Jobs page has no shipments yet, so the shipments alone miss it.
export function nextMczNumber(shipments: ShipmentItem[], masterJobs: string[] = []): string {
  let max = 0;
  for (const mn of [...shipments.map((s) => s.masterJobMczNumber), ...masterJobs]) {
    if (mn && mn.startsWith("MCZ")) {
      const num = parseInt(mn.substring(3), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `MCZ${String(max + 1).padStart(8, "0")}`;
}

export function existingMczNumbers(shipments: ShipmentItem[], masterJobs: string[] = []): string[] {
  const set = new Set<string>();
  for (const mn of [...shipments.map((s) => s.masterJobMczNumber), ...masterJobs]) {
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

// How documents write the package types of the app's list (PACK_TYPES).
const PACKAGE_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(PALLET|PALLETS|PLT|PLTS|PAL|PALS|SKID|SKIDS)\b/, "Pallet(s)"],
  [/\b(CARTON|CARTONS|CTN|CTNS|CARTOON|CARTOONS)\b/, "Cartons"],
  [/\b(WOODEN BOX|WOODEN BOXES|WOODEN CASE|WOODEN CASES|CRATE|CRATES|WDN|CASE|CASES)\b/, "Wooden boxes"],
  [/\b(BOX|BOXES|BX|BXS)\b/, "Boxes"],
  [/\b(DRUM|DRUMS|DRM|DRMS|BARREL|BARRELS)\b/, "Drums"],
  [/\b(COLLI|COLLO|PKG|PKGS|PACKAGE|PACKAGES|PIECE|PIECES|PCS)\b/, "Colli"],
];

/**
 * The extracted "Type Of Packages" matched to the app's package types:
 * "8 PLTS" → "Pallet(s)", "CRATES" → "Wooden boxes". Several types become a
 * comma-separated list; anything unknown stays as written so the user can fix
 * it before approving.
 */
export function normalizePackageType(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const exact = PACK_TYPES.find((t) => t.toLowerCase() === text.toLowerCase());
  if (exact) return exact;
  const upper = text.toUpperCase();
  const found = PACKAGE_SYNONYMS.filter(([re]) => re.test(upper)).map(([, type]) => type);
  // "Wooden boxes" also matches the plain "box" rule; keep only the more specific one.
  const types = [...new Set(found)].filter((t) => !(t === "Boxes" && found.includes("Wooden boxes")));
  return types.length > 0 ? types.join(", ") : text;
}

/**
 * Writes an approved package type onto the shipment and onto every container
 * and cargo line it is being saved with: the shipment's Type Of Packages is
 * read from those lines whenever it has any, so they must carry it too.
 */
export function withPackageType(
  data: controllers.ShipmentUpdateRequest,
  packageType: string | undefined,
  cargoItems: interfaces.CargoItemLine[] = [],
): controllers.ShipmentUpdateRequest {
  if (!packageType) return data;
  const out = { ...data, typeOfPackages: packageType };
  if (out.containers?.length) out.containers = out.containers.map((c) => ({ ...c, packageType }));
  const items = out.cargoItems?.length ? out.cargoItems : cargoItems;
  if (items.length > 0) out.cargoItems = items.map((i) => ({ ...i, packageType }));
  return out;
}

// ─── MBL shared info → master job ──────────────────────────────────

/** MBL detail labels and the master-job field each one is filed to. */
export const MBL_TO_MASTER_JOB: Record<string, string> = {
  "Booking Number": "bookingNumber",
  "Shipping line / Coloader": "shippingLine",
  "Load Type": "loadType",
  "Trade Direction": "tradeDirection",
  "Freight Mode": "freightMode",
  "Incoterm Origin": "incotermOrigin",
  "Incoterm Destination": "incotermDestination",
  "Master BoL Number": "masterBolNumber",
  "Master BoL Type": "masterBolType",
  Shipper: "shipper",
  Consignee: "consignee",
  POL: "pol",
  POD: "pod",
  Destination: "destination",
  "Estimated Departure": "estimatedDeparture",
  "Estimated Arrival": "estimatedArrival",
  Vessel: "vessel",
  Voyage: "voyage",
  PCS: "pcs",
  "Type Of Packages": "typeOfPackages",
  "Total Weight In Tons": "totalWeightTons",
  "Total Volume In CBM": "totalVolumeCbm",
};

/** The MBL detail whose tick files its containers to the master job. */
export const MBL_CONTAINERS_LABEL = "Container Number";

/** CNTR count/length/type rows only describe the containers; they have no tick of their own. */
export const isMblContainerDetail = (label: string) => /^CNTR (count|length|type) \[\d\]$/.test(label);

/** A container type in the app's dictionary from a document's length and kind: 40 + HQ → "40' HC". */
export function containerTypeFrom(length: string, kind: string): string {
  const size = (length.match(/20|40|45/) ?? [""])[0];
  if (!size) return "";
  const k = kind.trim().toUpperCase();
  const mapped =
    size === "45" ? "HQ"
    : /^(HQ|HC|HIGH ?CUBE)/.test(k) ? "HC"
    : /^(GP|DV|DRY|ST|STD|GENERAL)/.test(k) || !k ? "GP"
    : /^(RF|REEFER|RE)$/.test(k) ? "RF"
    : /^(HR)$/.test(k) ? "HR"
    : /^(OT|OPEN ?TOP)/.test(k) ? "OT"
    : /^(FR|FLAT ?RACK)/.test(k) ? "FR"
    : k;
  const type = `${size}' ${mapped}`;
  return (CONTAINER_TYPES as readonly string[]).includes(type) ? type : "";
}

/**
 * The containers named on the MBL, ready for the master job's Containers list.
 * The type is filled in only when it is unambiguous: a single CNTR group, or as
 * many groups as there are container numbers.
 */
export function mblContainers(info: Record<string, string>): interfaces.MasterJobContainerLine[] {
  const numbers = parseContainerNumbers(info[MBL_CONTAINERS_LABEL]);
  const groups = [1, 2, 3, 4]
    .map((i) => containerTypeFrom(info[`CNTR length [${i}]`] ?? "", info[`CNTR type [${i}]`] ?? ""))
    .filter(Boolean);
  return numbers.map((containerNumber, i) => ({
    containerNumber,
    sealNumber: "",
    type: groups.length === 1 ? groups[0]! : groups.length === numbers.length ? groups[i]! : "",
    shipmentIds: [],
  }));
}

/** The master-job update for the ticked MBL details (container numbers are filed separately). */
export function mblToMasterJobUpdate(
  info: Record<string, string>,
  ticked: Record<string, boolean>,
): controllers.MasterJobUpdateRequest {
  const out: Record<string, string> = {};
  for (const [label, field] of Object.entries(MBL_TO_MASTER_JOB)) {
    const value = (info[label] ?? "").trim();
    if (ticked[label] && value) out[field] = value;
  }
  return out as controllers.MasterJobUpdateRequest;
}

// MBL details that must be one of the app's options to be valid on the master job.
const MBL_OPTION_LISTS: Record<string, string> = {
  "Load Type": "Load Type",
  "Trade Direction": "Trade Direction",
  "Freight Mode": "Freight Mode",
  "Master BoL Type": "Master BoL Type",
  "Incoterm Origin": "Incoterm Origin",
  "Incoterm Destination": "Incoterm Destination",
};

/**
 * Which MBL details start ticked: everything with a home on the master job, except a
 * value that isn't one of the field's options (e.g. Master BoL Type "MBL") — the user
 * can still tick it.
 */
export function mblDefaultTicks(info: Record<string, string>): Record<string, boolean> {
  const ticks: Record<string, boolean> = {};
  for (const [label, value] of Object.entries(info)) {
    if (!value || !(label in MBL_TO_MASTER_JOB || label === MBL_CONTAINERS_LABEL)) continue;
    const options = MBL_OPTION_LISTS[label] ? DROPDOWN_OPTIONS[MBL_OPTION_LISTS[label]] : undefined;
    ticks[label] = !options || options.includes(value);
  }
  return ticks;
}

/**
 * Puts the approved cargo values of a document on a cargo line. Once a shipment has
 * container or cargo lines, its PCS, HS Code and Cargo Description are read from those
 * lines, so values kept only on the shipment would show blank. The line carries them
 * instead (pieces, HS code, description, gross weight in kg). A shipment that already
 * has cargo lines keeps its own and gets none added, so nothing is counted twice.
 */
export function withCargoLine(
  data: controllers.ShipmentUpdateRequest,
  approved: Record<string, string>,
  existingCargoItems: interfaces.CargoItemLine[] = [],
): controllers.ShipmentUpdateRequest {
  if (existingCargoItems.length > 0) return data;
  const description = (approved["Cargo Description"] ?? "").trim();
  const hsCode = (approved["HS Code"] ?? "").replace(/\D/g, "");
  const pieces = (approved["PCS"] ?? "").replace(/[^\d.]/g, "");
  const tons = parseFloat((approved["Total Weight In Tons"] ?? "").replace(",", "."));
  if (!description && !hsCode && !pieces) return data;
  const line: interfaces.CargoItemLine = {
    containerId: null,
    cargoDescription: description,
    hsCode,
    pieces,
    packageType: approved["Type Of Packages"] ?? "",
    grossWeight: Number.isFinite(tons) && tons > 0 ? String(Math.round(tons * 1000 * 1000) / 1000) : "",
    commercialInvoiceValue: "",
    currency: "",
  };
  return { ...data, cargoItems: [line] };
}
