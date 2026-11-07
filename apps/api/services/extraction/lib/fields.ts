export const SHIPMENT_FIELDS = [
  "Shipper", "Consignee", "Personal Reference", "Container Number", "Seal Number",
  "Booking Number", "Load Type", "Shipping line / Coloader",
  "POL", "POD", "Destination", "HS Code", "Cargo Description",
  "House BoL Number", "Master BoL Number", "House BoL Type", "Master BoL Type",
  "Vessel", "Voyage",
  "CNTR count [1]", "CNTR length [1]", "CNTR type [1]",
  "CNTR count [2]", "CNTR length [2]", "CNTR type [2]",
  "CNTR count [3]", "CNTR length [3]", "CNTR type [3]",
  "CNTR count [4]", "CNTR length [4]", "CNTR type [4]",
  "PCS", "Type Of Packages", "Total Weight In Tons", "Total Volume In CBM",
  "Cargo Origin", "Country code", "Origin",
  "Estimated Departure", "Estimated Arrival",
  "Trade Direction", "Agent",
  "Incoterms Origin", "Incoterms Destination",
  "Commercial Invoice Value",
];

// A customer's request for a quotation, read into a Sales quote. The labels are the ones the quote
// page shows; the web maps them to the quote's keys (apps/web/src/app/documents/_lib/quoteReading.ts,
// a test compares the two). No price, rate or currency is among them, so filterExtracted() drops
// any the model returns.
export const QUOTE_FIELDS = [
  "Customer", "Contact person", "Email", "Phone",
  "Trade Direction", "Freight Mode", "Incoterms", "Cargo Readiness Date",
  "Origin", "Pickup", "Destination", "Delivery",
  "Cargo Description", "Gross weight (kg)", "Volume (cbm)",
];

// An invoice's header fields, read on their own when its charge rows don't fit one reply.
export const INVOICE_HEADER_FIELDS = [
  "total_amount", "currency", "vendor", "invoice_number",
  "invoice_date", "due_date", "description", "service_type",
];

export const INVOICE_FIELDS = [...INVOICE_HEADER_FIELDS, "lines"];

// A carrier's booking confirmation, filed to a master job (named as the operators call them).
export const BOOKING_FIELDS = [
  "Booking Number", "Vessel", "Voyage", "POL", "POD", "MBL Number", "ETS", "ETA",
  "Cargo Closing", "VGM Closing", "SI Closing",
  "Release Reference", "Release Depot", "Redelivery Reference", "Redelivery Depot",
  "CNTR count [1]", "CNTR length [1]", "CNTR type [1]",
  "CNTR count [2]", "CNTR length [2]", "CNTR type [2]",
  "CNTR count [3]", "CNTR length [3]", "CNTR type [3]",
  "CNTR count [4]", "CNTR length [4]", "CNTR type [4]",
];

// A Master Bill of Lading, filed to its master job: what a booking confirmation gives, the B/L's own
// details, and the containers with their seals (labels as the master-job review shows them).
export const MBL_FIELDS = [
  "Master BoL Number", "Master BoL Type", "Booking Number", "Shipping line / Coloader", "Load Type",
  "Shipper", "Consignee", "Vessel", "Voyage", "POL", "POD", "Destination",
  "Estimated Departure", "Estimated Arrival",
  "Cargo Closing", "VGM Closing", "SI Closing",
  "Release Reference", "Release Depot", "Redelivery Reference", "Redelivery Depot",
  "Container Number", "Seal Number",
  "CNTR count [1]", "CNTR length [1]", "CNTR type [1]",
  "CNTR count [2]", "CNTR length [2]", "CNTR type [2]",
  "CNTR count [3]", "CNTR length [3]", "CNTR type [3]",
  "CNTR count [4]", "CNTR length [4]", "CNTR type [4]",
  "PCS", "Type Of Packages", "Total Weight In Tons", "Total Volume In CBM",
];

// A carrier's or terminal's notice about where a cargo is: an arrival notice, a delay notice, an
// availability mail, a rail or airline status. Facts with their day; what isn't printed stays out.
export const TRACKING_FIELDS = [
  "Container Numbers", "Vessel", "Voyage",
  "Loaded On Board", "ATD", "Transhipment Port", "Transhipment Arrived", "Transhipment Departed", "ATA", "Discharged", "Gate Out", "Delivered", "Empty Returned",
  "New ETD", "New ETA", "Customs Hold", "Available From", "Last Free Day",
];

export const CUSTOMS_FIELDS = ["MRN Number", "Shipper", "Consignee", "Total Weight In Tons", "Container Number"];

/**
 * Whether what was read from a PDF's text layer is enough to keep: something was found, and
 * every required field among it. Otherwise the document is read again as an image.
 */
export function textReadingUsable(extracted: Record<string, string>, requiredFields: string[]): boolean {
  return Object.keys(extracted).length > 0 && requiredFields.every((f) => !!extracted[f]?.trim());
}

export function filterExtracted(
  raw: Record<string, unknown>,
  validFields: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const fieldSet = new Set(validFields);
  for (const [key, value] of Object.entries(raw)) {
    if (!fieldSet.has(key) && key !== "__type__" && key !== "Personal Reference") continue;
    if (typeof value === "string" && value.trim()) {
      result[key] = value.trim();
    } else if (key === "lines" && Array.isArray(value)) {
      // An invoice's charge rows, kept as JSON until they are read apart (lib/invoiceLines).
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}

// A reply that must be ONE JSON object (the fields of a single document). The object is read
// first, so a "[3]" inside a value, or one value sent as a list, is not taken for the whole reply.
export function parseJsonObjectFromResponse(text: string): Record<string, unknown> | null {
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    const parsed: unknown = JSON.parse(objMatch[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseJsonFromResponse(text: string): unknown {
  // Try array first
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ }
  }
  // Try object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }
  return null;
}
