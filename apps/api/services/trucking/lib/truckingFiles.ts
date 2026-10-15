import { createHash } from "node:crypto";
import { APIError } from "encore.dev/api";
import { sniffFileType, storedFileType } from "../../warehouse/services/fileType";
import type { TruckingDocumentKind } from "../interfaces/interfaces";

// Consignment documents as uploaded: at most 10 MB, the type taken from the bytes (never from the
// name or what the client claims). A POD must be a photo or a PDF. Pure.

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_KINDS: readonly TruckingDocumentKind[] = ["POD", "CMR", "DELIVERY_NOTE", "OTHER"];

export interface CheckedFile {
  fileName: string;
  bytes: Buffer;
  contentType: string;
  sha256: string;
}

/** The name as stored: no folders, at most 200 characters. */
export function cleanFileName(name: unknown): string {
  const base = (typeof name === "string" ? name : "").split(/[\\/]/).pop()!.trim();
  if (!base) throw APIError.invalidArgument("The file name is required");
  return base.slice(0, 200);
}

/**
 * The uploaded file, checked: not empty, at most 10 MB; `photoOrPdf` refuses anything whose bytes
 * are not an image or a PDF (else an unknown type is kept as a download).
 */
export function checkUpload(fileName: unknown, fileBase64: unknown, photoOrPdf: boolean): CheckedFile {
  const name = cleanFileName(fileName);
  const bytes = Buffer.from(typeof fileBase64 === "string" ? fileBase64 : "", "base64");
  if (!bytes.length) throw APIError.invalidArgument("The file is empty");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw APIError.invalidArgument("The file is larger than 10 MB");
  const sniffed = sniffFileType(bytes);
  if (photoOrPdf && !sniffed) throw APIError.invalidArgument("Upload a photo (JPEG, PNG, HEIC…) or a PDF");
  return { fileName: name, bytes, contentType: sniffed ?? storedFileType(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function documentKind(v: unknown): TruckingDocumentKind {
  if (!DOCUMENT_KINDS.includes(v as TruckingDocumentKind)) throw APIError.invalidArgument("The document kind must be POD, CMR, DELIVERY_NOTE or OTHER");
  return v as TruckingDocumentKind;
}
