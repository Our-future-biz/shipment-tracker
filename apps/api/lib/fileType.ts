// Uploaded files (gate photos and documents, trucking PODs and haulier invoices): what a stored file is, from its own bytes. A file is served to the
// browser only as one of the types below; anything else (HTML, SVG, scripts, unknown) is kept but
// handed out as a download (application/octet-stream), so it can never run in the app's page.

/** Types the gate log shows inline. */
export const INLINE_FILE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "application/pdf"] as const;
export const DOWNLOAD_ONLY = "application/octet-stream";

const startsWith = (b: Buffer, bytes: number[], at = 0) => bytes.every((x, i) => b[at + i] === x);

/** The type the bytes really are (one of INLINE_FILE_TYPES), or null when not one of them. */
export function sniffFileType(b: Buffer): (typeof INLINE_FILE_TYPES)[number] | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  // ISO BMFF "ftyp" box with a HEIF brand.
  if (startsWith(b, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = b.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

/** The type a file is stored and served as: what its bytes are, or a download. */
export const storedFileType = (b: Buffer): string => sniffFileType(b) ?? DOWNLOAD_ONLY;

/** A stored type as it may be served (older rows kept the type the client claimed). */
export const servedFileType = (stored: string): string =>
  (INLINE_FILE_TYPES as readonly string[]).includes(stored) ? stored : DOWNLOAD_ONLY;
