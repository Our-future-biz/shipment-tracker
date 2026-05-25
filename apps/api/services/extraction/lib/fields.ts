export const SHIPMENT_FIELDS = [
  "Shipper", "Consignee", "Personal Reference", "Container Number",
  "Booking Number", "Load Type", "Shipping line / Coloader",
  "POL", "POD", "Destination", "HS Code", "Cargo Description",
  "House BoL Number", "Master BoL Number", "House BoL Type", "Master BoL Type",
  "Vessel", "Voyage",
  "CNTR count [1]", "CNTR length [1]", "CNTR type [1]",
  "CNTR count [2]", "CNTR length [2]", "CNTR type [2]",
  "CNTR count [3]", "CNTR length [3]", "CNTR type [3]",
  "CNTR count [4]", "CNTR length [4]", "CNTR type [4]",
  "PCS", "Total Weight In Tons", "Total Volume In CBM",
  "Cargo Origin", "Country code", "Origin",
  "Estimated Departure", "Estimated Arrival",
  "Trade Direction", "Agent",
  "Incoterm Origin", "Incoterm Destination",
  "Commercial Invoice Value",
];

export const QUOTE_FIELDS = [
  "Shipper", "Consignee", "Load Type", "Agent", "Agent's PIC",
  "Incoterm Origin", "Incoterm Destination", "Cargo Origin", "Origin",
  "POL", "POD", "Destination", "HS Code", "Cargo Description",
  "Trade Direction", "Volume", "Weight", "Number of pieces",
  "CNTR count [1]", "CNTR length [1]",
  "CNTR count [2]", "CNTR length [2]",
  "CNTR count [3]", "CNTR length [3]",
  "CNTR count [4]", "CNTR length [4]",
  "PCS",
];

export const INVOICE_FIELDS = [
  "total_amount", "currency", "vendor", "invoice_number",
  "invoice_date", "due_date", "description", "service_type",
];

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
    }
  }
  return result;
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
