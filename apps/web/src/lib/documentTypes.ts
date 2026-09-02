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
  "Other",
] as const;

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

/** Customs review status of one document. */
export type CustomsReviewStatus = "" | "approved" | "declined";
