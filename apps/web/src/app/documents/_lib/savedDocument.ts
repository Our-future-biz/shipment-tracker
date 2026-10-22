import { guessDocumentType } from "@/lib/documentTypes";
import type { ExtractedField } from "./extraction";

/**
 * The read numbers a document read into Shipments is saved under, in order: the House B/L
 * number, else the Master B/L, else the Booking number.
 */
const DOCUMENT_NUMBER_LABELS = ["House BoL Number", "Master BoL Number", "Booking Number"] as const;

/** The number the document is named after, and which one it is ("" when none was read). */
export function documentNumber(fields: ExtractedField[]): { label: string; value: string } {
  for (const label of DOCUMENT_NUMBER_LABELS) {
    const value = fields.find((f) => f.column === label)?.extractedValue.trim();
    if (value) return { label, value };
  }
  return { label: "", value: "" };
}

/**
 * The file name a read document is saved under on the shipment: its document number with
 * the original extension (HLCU12345678.pdf). Characters a file name can't hold become "-";
 * without a number the original name is kept.
 */
export function savedDocumentName(fields: ExtractedField[], originalName: string): string {
  return numberedFileName(documentNumber(fields).value, originalName);
}

/**
 * A file named after a document number (an invoice number, a B/L number) with the original
 * extension. Characters a file name can't hold become "-"; without a number the original
 * name is kept.
 */
export function numberedFileName(number: string, originalName: string): string {
  const safe = number.trim().replace(/[\\/:*?"<>|]+/g, "-");
  if (!safe) return originalName;
  const extension = /\.[a-z0-9]+$/i.exec(originalName)?.[0].toLowerCase() ?? "";
  return `${safe}${extension}`;
}

/**
 * The document type offered for a read document: a Bill of Lading when a B/L number was
 * read, a Booking confirmation when only a booking number was; otherwise a guess from the
 * file name, else a Bill of Lading. Only a suggestion — the user can pick another type.
 */
export function suggestedDocumentType(fields: ExtractedField[], originalName: string): string {
  const { label } = documentNumber(fields);
  if (label === "House BoL Number" || label === "Master BoL Number") return "Bill of Lading";
  if (label === "Booking Number") return "Booking confirmation";
  return guessDocumentType(originalName) || "Bill of Lading";
}
