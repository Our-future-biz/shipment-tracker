import type { controllers, interfaces } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/enums";
import { extractContainerNumbers } from "@/lib/container";
import { CONTAINER_TYPES, PACK_TYPES } from "@/lib/cargo";
import { DROPDOWN_OPTIONS } from "@/lib/columnConfig";

export type Destination = "shipment" | "invoicing" | "quote" | "masterjob" | "customs" | "booking";
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

/** The fields of a request type that hold free text (a plain `string`), so any text can go in. */
type TextFields<T> = { [K in keyof T]-?: string extends NonNullable<T[K]> ? (NonNullable<T[K]> extends string ? K : never) : never }[keyof T];
type ShipmentTextField = TextFields<controllers.ShipmentUpdateRequest>;
type MasterJobTextField = TextFields<controllers.MasterJobUpdateRequest>;

// Extracted label → ShipmentUpdateRequest field name.
// Labels are the ones the backend emits (apps/api/services/extraction/lib/fields.ts).
export const SHIPMENT_FIELD_MAP: Record<string, ShipmentTextField> = {
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

  const td = (out["Trade Direction"] || "").trim().toUpperCase();
  if (td === "IMP" || td === "IMPORT") out["Trade Direction"] = "Import";
  else if (td === "EXP" || td === "EXPORT") out["Trade Direction"] = "Export";

  if (out["Type Of Packages"]) out["Type Of Packages"] = normalizePackageType(out["Type Of Packages"]);

  // "40HC" + "DRY" → the app's Container's Length "40" and Type "HC".
  for (const i of [1, 2, 3, 4]) {
    const type = containerTypeFrom(out[`CNTR length [${i}]`] ?? "", out[`CNTR type [${i}]`] ?? "");
    if (!type) continue;
    const [size, kind] = type.split(" ");
    out[`CNTR length [${i}]`] = size!.replace("'", "");
    out[`CNTR type [${i}]`] = kind!;
  }

  if (!out["Freight Mode"]) {
    const hasVessel = !!out["Vessel"];
    const hasContainer = !!(out["Container Number"] || out["CNTR count [1]"] || out["CNTR length [1]"]);
    if (hasVessel || hasContainer) out["Freight Mode"] = "Sea Freight";
  }

  return out;
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
  const out: controllers.ShipmentUpdateRequest = {};
  for (const [label, value] of Object.entries(labelValues)) {
    const apiField = SHIPMENT_FIELD_MAP[label];
    if (apiField && value) out[apiField] = value;
  }
  return out;
}

export function normalizeCurrency(raw?: string): string {
  const c = (raw || "").toUpperCase();
  return (CURRENCIES as readonly string[]).includes(c) ? c : "CZK";
}

// No job number and no Created By: the server gives the next job number when it stores the
// shipment, and stamps who created it.
export function baseCreatePayload(): controllers.ShipmentCreateRequest {
  return {
    tradeDirection: "Import",
    freightMode: "Sea Freight",
    department: "Operation Department",
    status: "Booking Confirmation Pending [IMP]",
    customsStatus: "Waiting For Commercial Paperwork",
  };
}

// Build the review field list for the shipment destination, detecting conflicts
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

// ─── Booking confirmation → master job ─────────────────────────────

/** Booking confirmation labels (apps/api/services/extraction/lib/fields.ts) and the master-job field each fills. */
export const BOOKING_TO_MASTER_JOB: Record<string, MasterJobTextField & keyof interfaces.MasterJobItem> = {
  "Booking Number": "bookingNumber",
  Equipment: "equipment",
  Vessel: "vessel",
  Voyage: "voyage",
  POL: "pol",
  POD: "pod",
  "MBL Number": "masterBolNumber",
  ETS: "estimatedDeparture",
  ETA: "estimatedArrival",
  "Cargo Closing": "closingDate",
  "VGM Closing": "vgmClosing",
  "SI Closing": "siClosing",
  "Release Reference": "releaseReference",
  "Release Depot": "releaseDepot",
  "Redelivery Reference": "redeliveryReference",
  "Redelivery Depot": "redeliveryDepot",
};

/** The master job's current value for a booking label, to show conflicts in the review. */
export function bookingExistingValue(masterJob: interfaces.MasterJobItem | undefined, label: string): string {
  const field = BOOKING_TO_MASTER_JOB[label];
  if (!masterJob || !field) return "";
  const value = masterJob[field];
  return typeof value === "string" ? value : "";
}

/** Booking labels the master job stores as dates ("YYYY-MM-DD"). */
const BOOKING_DATE_LABELS = new Set(["ETS", "ETA", "Cargo Closing", "VGM Closing", "SI Closing"]);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date as read off a document — "2026-11-20", "20.11.2026", "20/11/2026", "20-NOV-2026",
 * "20 Nov 2026" (day first) — as "YYYY-MM-DD"; "" when it isn't a full date (e.g. no year).
 */
export function toIsoDate(value: string): string {
  const s = value.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  // A time after the date ("20.11.2026 12:00", common on closings) is ignored.
  const dmy = s.match(/^(\d{1,2})[./\-\s]+(\d{1,2}|[A-Za-z]{3,})[./\-\s,]+(\d{4})(?:[\sT,].*)?$/);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [+iso[1]!, +iso[2]!, +iso[3]!];
  else if (dmy) {
    const month = /^\d+$/.test(dmy[2]!) ? +dmy[2]! : MONTHS.indexOf(dmy[2]!.slice(0, 3).toLowerCase()) + 1;
    [y, m, d] = [+dmy[3]!, month, +dmy[1]!];
  } else return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Approved booking dates that can't be read as a full date; the master job would refuse them. */
export function invalidBookingDates(approved: Record<string, string>): string[] {
  return Object.entries(approved)
    .filter(([label, value]) => BOOKING_DATE_LABELS.has(label) && value.trim() && !toIsoDate(value))
    .map(([label]) => label);
}

/** The master-job update for the approved booking values, dates as "YYYY-MM-DD". */
export function bookingToMasterJobUpdate(approved: Record<string, string>): controllers.MasterJobUpdateRequest {
  const out: controllers.MasterJobUpdateRequest = {};
  for (const [label, field] of Object.entries(BOOKING_TO_MASTER_JOB)) {
    const value = (approved[label] ?? "").trim();
    if (value) out[field] = BOOKING_DATE_LABELS.has(label) ? toIsoDate(value) : value;
  }
  return out;
}

/**
 * Folds a booking's CNTR count/length/type groups into one Equipment value, the form the
 * master job keeps: "2 x 40' HC, 1 x 20' GP". Groups that don't make a known type stay as read.
 */
export function withBookingEquipment(extracted: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const parts: string[] = [];
  for (const [label, value] of Object.entries(extracted)) {
    if (!/^CNTR (count|length|type) \[\d\]$/.test(label)) out[label] = value;
  }
  for (const i of [1, 2, 3, 4]) {
    const length = extracted[`CNTR length [${i}]`] ?? "";
    const kind = extracted[`CNTR type [${i}]`] ?? "";
    const count = (extracted[`CNTR count [${i}]`] ?? "").trim();
    const type = containerTypeFrom(length, kind) || [length, kind].filter(Boolean).join(" ");
    if (type) parts.push(count ? `${count} x ${type}` : type);
  }
  if (parts.length > 0) out.Equipment = parts.join(", ");
  return out;
}

// ─── MBL shared info → master job ──────────────────────────────────

/** MBL detail labels and the master-job field each one is filed to. */
export const MBL_TO_MASTER_JOB: Record<string, MasterJobTextField> = {
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
  // A reefer stays a reefer whatever the length says; a 40' one is the high-cube reefer (HRF), as
  // there is no standard-height 40' reefer.
  const reefer = /^(RF|REEFER|RE|HR|RH|HRF)$/.test(kind.trim().toUpperCase());
  // Documents often put the high cube in the length ("40HC") and the kind as "DRY".
  const k = /HC|HQ|HIGH ?CUBE/i.test(length) ? "HC" : kind.trim().toUpperCase();
  const mapped =
    size === "45" ? "HQ"
    : reefer ? (size === "40" ? "HRF" : "RF")
    : /^(HQ|HC|HIGH ?CUBE)/.test(k) ? "HC"
    : /^(GP|DV|DRY|ST|STD|GENERAL)/.test(k) || !k ? "GP"
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
  const out: controllers.MasterJobUpdateRequest = {};
  for (const [label, field] of Object.entries(MBL_TO_MASTER_JOB)) {
    const value = (info[label] ?? "").trim();
    if (ticked[label] && value) out[field] = value;
  }
  return out;
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
  const out: controllers.ShipmentUpdateRequest = { ...data, cargoItems: [line] };
  // Volume has no place on a cargo line; with a single container it goes on that container,
  // which is where the shipment's Total Volume (m³) is read from.
  const cbm = parseFloat((approved["Total Volume In CBM"] ?? "").replace(",", "."));
  if (out.containers?.length === 1 && !out.containers[0]!.volume && Number.isFinite(cbm) && cbm > 0) {
    out.containers = [{ ...out.containers[0]!, volume: String(cbm) }];
  }
  return out;
}

/**
 * Gives the container rows of a save their type ("40' HC") from the document's container
 * group, when there is exactly one group so the type can't be mixed up.
 */
export function withContainerType(
  data: controllers.ShipmentUpdateRequest,
  approved: Record<string, string>,
): controllers.ShipmentUpdateRequest {
  if (!data.containers?.length) return data;
  const groups = [1, 2, 3, 4]
    .map((i) => containerTypeFrom(approved[`CNTR length [${i}]`] ?? "", approved[`CNTR type [${i}]`] ?? ""))
    .filter(Boolean);
  if (groups.length !== 1) return data;
  return { ...data, containers: data.containers.map((c) => (c.type ? c : { ...c, type: groups[0]! })) };
}
