import type { SalesQuoteData } from "./types";

// The sections of a quote's form as "Copy from" and "Duplicate" offer them: what a quote can
// take over from another quote or a shipment, one tick box each.
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

// Fields that belong to each section of a SalesQuoteData record. The sales owner is not one of
// the customer's: who owns a quote does not change with whose customer details it takes, and a
// duplicate belongs to whoever makes it, which the server sees to.
export const SECTION_FIELDS: Record<SectionKey, (keyof SalesQuoteData)[]> = {
  customer: [
    "customerName",
    "customerId",
    "customerContact",
    "customerEmail",
    "customerPhone",
    "customerLabel",
  ],
  shipment: ["direction", "serviceType", "incoterm", "readyDate"],
  routing: ["origin", "destination", "pickup", "delivery"],
  cargo: ["commodity", "stackable", "dangerous", "packages", "weight", "cbm"],
  // The rates travel with the lines they convert, so copied prices keep their totals.
  pricing: ["buyingLines", "sellingLines", "currency", "rates"],
  terms: ["shippingTerms", "shippingIncludes", "shippingExcludes"],
};

// Whether a source holds anything of a section.
export function hasSection(source: SalesQuoteData, section: SectionKey): boolean {
  return SECTION_FIELDS[section].some((field) => source[field] !== undefined);
}

// The ticked sections of another quote, each taken whole: every field of a section is set, to
// nothing where the source has none. A copied section so leaves none of what stood there before -
// not the old customer's link under the new name, nor the old pickup address under a new route.
export function pickSections(source: SalesQuoteData, checked: SectionKey[]): Partial<SalesQuoteData> {
  const patch: Partial<SalesQuoteData> = {};
  for (const section of checked) {
    for (const field of SECTION_FIELDS[section]) {
      // Assign field-by-field; each key maps to its own value type in SalesQuoteData.
      (patch as Record<string, unknown>)[field] = source[field];
    }
  }
  return patch;
}

// The ticked sections of a source that knows only part of a section, as a shipment does: only
// the fields it has. What it has none of stays on the quote as it was typed.
export function pickCarried(source: SalesQuoteData, checked: SectionKey[]): Partial<SalesQuoteData> {
  const patch = pickSections(source, checked);
  for (const field of Object.keys(patch) as (keyof SalesQuoteData)[]) {
    if (patch[field] === undefined) delete patch[field];
  }
  return patch;
}
