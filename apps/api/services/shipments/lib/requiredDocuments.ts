// The documents a job is expected to have, and which of them customs reviews: the server's copy
// of apps/web/src/lib/documentTypes.ts, which the Documents and Customs tabs judge by. The
// managers' cockpit (lib/managersCockpitExtra) reads it, so a manager is told about the same
// missing paper the shipment's own tabs flag. tests/requiredDocuments.test.ts compares the two
// files: change a list in one and the test names the other.

/** Documents a shipment is expected to have - missing ones are flagged. */
export const REQUIRED_DOCUMENT_TYPES = ["Invoice", "Packing list", "Bill of Lading", "Booking confirmation", "Customs document", "CMR / POD"] as const;

/** The safety paperwork a shipment of dangerous goods has to have as well. */
export const SAFETY_PAPERWORK_TYPES = ["MSDS", "Dangerous Goods Declaration"] as const;

/** Every document a shipment is expected to have; missing ones are flagged. */
export const requiredDocumentTypes = (dangerous: boolean): readonly string[] =>
  dangerous ? [...REQUIRED_DOCUMENT_TYPES, ...SAFETY_PAPERWORK_TYPES] : REQUIRED_DOCUMENT_TYPES;

/** The commercial paperwork customs needs before it can start: an invoice and a packing list. */
export const CUSTOMS_DOCUMENT_TYPES: readonly string[] = ["Invoice", "Packing list"];

/**
 * The documents customs approves or declines: the web's Commercial Documents and Customs
 * Documents tables (its isReviewedDocumentType). Shipping documents, safety paperwork and the
 * suppliers' invoices are only shown, never reviewed.
 */
export const REVIEWED_DOCUMENT_TYPES: readonly string[] = ["Invoice", "Packing list", "Customs document", "Import Instructions", "Certificate of origin"];

export const isReviewedDocumentType = (documentType: string): boolean => REVIEWED_DOCUMENT_TYPES.includes(documentType);

/** The name a type is shown under where the stored one is too short ("Invoice" is the Commercial Invoice). */
const DOCUMENT_TYPE_LABELS: Record<string, string> = { Invoice: "Commercial Invoice" };
export const documentTypeLabel = (documentType: string): string => DOCUMENT_TYPE_LABELS[documentType] ?? documentType;

/**
 * The types among `wanted` a shipment's files do not cover. A document customs declined does not
 * stand for its type (the web's receivedDocumentsByType): the type is missing until a file that
 * was not declined is there.
 */
export function missingDocumentTypes(wanted: readonly string[], files: readonly { documentType: string; customsStatus: string }[]): string[] {
  const received = new Set(files.filter((f) => f.documentType && f.customsStatus !== "declined").map((f) => f.documentType));
  return wanted.filter((type) => !received.has(type));
}
