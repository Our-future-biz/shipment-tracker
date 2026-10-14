import type { SalesQuoteData } from "./types";

// The parts of a sales quote that can be copied from another quote (or a shipment) or carried
// into a duplicate, and the fields each part covers.

export type SectionKey = "customer" | "shipment" | "routing" | "cargo" | "pricing" | "terms";

export interface Section {
  key: SectionKey;
  label: string;
}

export const SECTIONS: Section[] = [
  { key: "customer", label: "Customer" },
  { key: "shipment", label: "Shipment details" },
  { key: "routing", label: "Routing" },
  { key: "cargo", label: "Cargo" },
  { key: "pricing", label: "Pricing" },
  { key: "terms", label: "Shipping terms" },
];

// Fields that belong to each section of a SalesQuoteData record.
const SECTION_FIELDS: Record<SectionKey, (keyof SalesQuoteData)[]> = {
  customer: ["customerName", "customerId", "customerContact", "customerEmail", "customerPhone", "customerLabel", "salesOwner"],
  shipment: ["direction", "serviceType", "incoterm", "readyDate"],
  routing: ["origin", "destination", "pickup", "delivery"],
  cargo: ["commodity", "stackable", "dangerous", "packages", "weight", "cbm"],
  pricing: ["buyingLines", "sellingLines", "currency"],
  terms: ["shippingTerms", "shippingIncludes", "shippingExcludes"],
};

/** Only the fields of the checked sections of `source`. */
export function pickSections(source: Partial<SalesQuoteData>, checked: SectionKey[]): Partial<SalesQuoteData> {
  const patch: Partial<SalesQuoteData> = {};
  for (const section of checked) {
    for (const field of SECTION_FIELDS[section]) {
      const value = source[field];
      if (value === undefined) continue;
      // Assign field-by-field; each key maps to its own value type in SalesQuoteData.
      (patch as Record<string, unknown>)[field] = value;
    }
  }
  return patch;
}
