export const QUOTE_COLUMNS = [
  "Shipper",
  "Consignee",
  "Service",
  "Trade Direction",
  "Load Type",
  "Agent",
  "Agent's PIC",
  "Incoterm Origin",
  "Incoterm Destination",
  "Cargo Origin",
  "Origin",
  "POL",
  "POD",
  "Destination",
  "HS Code",
  "Cargo Description",
  "Volume",
  "Weight",
  "Number of pieces",
  "CNTR count [1]",
  "CNTR length [1]",
  "CNTR count [2]",
  "CNTR length [2]",
  "CNTR count [3]",
  "CNTR length [3]",
  "CNTR count [4]",
  "CNTR length [4]",
  "PCS",
] as const;

export type QuoteColumn = (typeof QUOTE_COLUMNS)[number];

export const COPYABLE_FIELDS: string[] = [
  "Shipper",
  "Consignee",
  "Agent",
  "Agent's PIC",
  "Incoterm Origin",
  "Incoterm Destination",
  "Cargo Origin",
  "Origin",
  "POL",
  "POD",
  "Destination",
  "HS Code",
  "Cargo Description",
];

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"];

export const QUOTE_DROPDOWNS: Record<string, string[]> = {
  "Load Type": ["Full Load", "Consolidation", "Customs Clearance"],
  Service: ["SEA", "AIR", "RAIL", "ROAD"],
  "Trade Direction": ["Import", "Export"],
  "Incoterm Origin": INCOTERMS,
  "Incoterm Destination": INCOTERMS,
  "CNTR length [1]": ["20", "40", "40HC", "45"],
  "CNTR length [2]": ["20", "40", "40HC", "45"],
  "CNTR length [3]": ["20", "40", "40HC", "45"],
  "CNTR length [4]": ["20", "40", "40HC", "45"],
};

const NUMBER_COLUMNS = new Set<string>([
  "Volume",
  "Weight",
  "Number of pieces",
  "CNTR count [1]",
  "CNTR count [2]",
  "CNTR count [3]",
  "CNTR count [4]",
  "PCS",
]);

export type QuoteColType = "text" | "dropdown" | "number";

export function quoteColType(col: string): QuoteColType {
  if (QUOTE_DROPDOWNS[col]) return "dropdown";
  if (NUMBER_COLUMNS.has(col)) return "number";
  return "text";
}

export function quoteColWidth(col: string): number {
  if (col === "Cargo Description") return 200;
  return 140;
}

// Maps a quote data field label → the shipment create/update apiField, used when
// booking a quote into a shipment.
export const QUOTE_TO_SHIPMENT_FIELD: Record<string, string> = {
  Shipper: "shipper",
  Consignee: "consignee",
  "Trade Direction": "tradeDirection",
  "Load Type": "loadType",
  Agent: "agent",
  "Agent's PIC": "agentPic",
  "Incoterm Origin": "incotermOrigin",
  "Incoterm Destination": "incotermDestination",
  "Cargo Origin": "cargoOrigin",
  Origin: "origin",
  POL: "pol",
  POD: "pod",
  Destination: "destination",
  "HS Code": "hsCode",
  "Cargo Description": "cargoDescription",
  PCS: "pcs",
  "CNTR count [1]": "containerCount1",
  "CNTR length [1]": "containerLength1",
  "CNTR count [2]": "containerCount2",
  "CNTR length [2]": "containerLength2",
  "CNTR count [3]": "containerCount3",
  "CNTR length [3]": "containerLength3",
  "CNTR count [4]": "containerCount4",
  "CNTR length [4]": "containerLength4",
};

// ─── Quote cost estimates (stored in quote.data.costs) ─────────────────
export const QUOTE_COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection / Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
] as const;

export interface QuoteCost {
  category: string;
  estAmount: string;
  estCurrency: string;
  vendor: string;
}

export type QuoteData = Record<string, unknown> & { costs?: QuoteCost[] };

export function quoteField(data: unknown, label: string): string {
  if (!data || typeof data !== "object") return "";
  const v = (data as Record<string, unknown>)[label];
  return v == null ? "" : String(v);
}

export function quoteCosts(data: unknown): QuoteCost[] {
  if (!data || typeof data !== "object") return [];
  const costs = (data as QuoteData).costs;
  return Array.isArray(costs) ? costs : [];
}

// Next "CZQ00000001"-style number from the existing quote list.
export function nextQuoteNumber(quoteNumbers: string[]): string {
  let max = 0;
  for (const qn of quoteNumbers) {
    if (qn.startsWith("CZQ")) {
      const num = parseInt(qn.substring(3), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `CZQ${String(max + 1).padStart(8, "0")}`;
}
