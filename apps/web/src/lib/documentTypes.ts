/**
 * Business document types used by the Documents and Customs tabs.
 * Mirrors DOC_TYPES / DOC_REQUIRED / DOC_OPTIONAL from the approved mockup.
 */
export const DOCUMENT_TYPES = [
  "Invoice",
  "Packing list",
  "Bill of Lading",
  "Booking confirmation",
  "Customs document",
  "CMR / POD",
  "Insurance",
  "Certificate of origin",
  "Airfreight Charges",
  "Railfreight Charges",
  "Seafreight Charges",
  "Pre-carriage Charges",
  "On-carriage Charges",
  "Insurance Charges",
  "Other",
] as const;

/** Whether a stored type is one of DOCUMENT_TYPES (legacy values and empty ones are not). */
export const isKnownDocumentType = (documentType: string) =>
  (DOCUMENT_TYPES as readonly string[]).includes(documentType);

/** Documents a shipment is expected to have — missing ones are flagged. */
export const REQUIRED_DOCUMENT_TYPES = [
  "Invoice",
  "Packing list",
  "Bill of Lading",
  "Booking confirmation",
  "Customs document",
  "CMR / POD",
] as const;

/** Nice to have, never flagged as missing. */
export const OPTIONAL_DOCUMENT_TYPES = ["Insurance", "Certificate of origin"] as const;

/**
 * Best-effort type guess from a file name, offered to the user as a
 * pre-filled suggestion — never applied silently.
 */
export function guessDocumentType(fileName: string): string {
  const n = fileName.toLowerCase();
  if (/(^|[^a-z])(inv|invoice|faktura)/.test(n)) return "Invoice";
  if (/(packing|balic|pack.?list)/.test(n)) return "Packing list";
  if (/(bill.?of.?lading|\bbol\b|\bhbl\b|\bmbl\b|konosament)/.test(n)) return "Bill of Lading";
  if (/(booking|rezervac)/.test(n)) return "Booking confirmation";
  if (/(customs|celni|celní|jsd|\bsad\b)/.test(n)) return "Customs document";
  if (/(\bcmr\b|\bpod\b|proof.?of.?delivery|dodac)/.test(n)) return "CMR / POD";
  if (/(insur|pojist)/.test(n)) return "Insurance";
  if (/(origin|puvod|původ|\bco\b)/.test(n)) return "Certificate of origin";
  return "";
}

/** The suppliers' invoices for a shipment's transport and insurance: listed, never reviewed by customs. */
export const SUPPLIER_INVOICE_TYPES = [
  "Airfreight Charges",
  "Railfreight Charges",
  "Seafreight Charges",
  "Pre-carriage Charges",
  "On-carriage Charges",
  "Insurance Charges",
] as const;

/**
 * The Documents tab lists a shipment's files in four tables, by document type. Commercial
 * is only ever invoices and packing lists; a type that is in none of the tables (Other, or
 * not set yet) is listed with the shipping documents.
 */
export const DOCUMENT_GROUPS = [
  { title: "Commercial Documents", types: ["Invoice", "Packing list"] },
  { title: "Shipping Documents", types: ["Bill of Lading", "Booking confirmation", "CMR / POD", "Insurance"] },
  { title: "Customs Documents", types: ["Customs document", "Certificate of origin"] },
  { title: "Suppliers Invoice(s)", types: SUPPLIER_INVOICE_TYPES },
] as const;

/** The tables the Customs tab shows: all but the suppliers' invoices, which customs doesn't work with. */
export const CUSTOMS_TAB_GROUPS = DOCUMENT_GROUPS.slice(0, 3);

const FALLBACK_DOCUMENT_GROUP = DOCUMENT_GROUPS[1];

export function documentGroupOf(documentType: string): (typeof DOCUMENT_GROUPS)[number] {
  return DOCUMENT_GROUPS.find((g) => (g.types as readonly string[]).includes(documentType)) ?? FALLBACK_DOCUMENT_GROUP;
}

/** The supplier invoice type for a cost charge code ("" when none fits). */
const SUPPLIER_INVOICE_BY_CHARGE: Record<string, (typeof SUPPLIER_INVOICE_TYPES)[number]> = {
  air_freight: "Airfreight Charges",
  rail_freight: "Railfreight Charges",
  ocean_freight: "Seafreight Charges",
  pickup: "Pre-carriage Charges",
  delivery: "On-carriage Charges",
  insurance: "Insurance Charges",
};

export const supplierInvoiceType = (chargeCode: string): string => SUPPLIER_INVOICE_BY_CHARGE[chargeCode] ?? "";

/** The commercial paperwork customs needs before it can start: an invoice and a packing list. */
export const CUSTOMS_DOCUMENT_TYPES: readonly string[] = ["Invoice", "Packing list"];

/**
 * Documents customs approves or declines: everything in the Commercial and the Customs
 * Documents tables. Shipping documents are only shown, never reviewed.
 */
export const isReviewedDocumentType = (documentType: string) =>
  ([...DOCUMENT_GROUPS[0].types, ...DOCUMENT_GROUPS[2].types] as string[]).includes(documentType);

/** Customs review status of one document. */
export type CustomsReviewStatus = "" | "approved" | "declined";
