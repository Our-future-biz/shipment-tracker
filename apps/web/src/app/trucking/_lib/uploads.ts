import { fileToBase64 } from "@/lib/files";

// Files sent to Trucking (documents of a consignment, the haulier's POD): the checks done before
// reading them, and the read itself. The server checks again and sniffs the real type.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const IMAGE_OR_PDF_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const IMAGE_OR_PDF_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"];

/** What the file picker offers for a POD: photos and PDFs. */
export const POD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf";

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** A photo or a PDF, by its type or (a phone may send none) its extension. */
export function isImageOrPdf(file: { name: string; type: string }): boolean {
  if (file.type) return IMAGE_OR_PDF_TYPES.includes(file.type.toLowerCase()) || file.type.toLowerCase().startsWith("image/");
  return IMAGE_OR_PDF_EXTENSIONS.includes(extensionOf(file.name));
}

/** Why a file cannot be uploaded, or null. `imagesAndPdfOnly` for a POD. */
export function uploadProblem(file: { name: string; size: number; type: string }, { imagesAndPdfOnly = false } = {}): string | null {
  if (file.size === 0) return "The file is empty";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 10 MB";
  if (imagesAndPdfOnly && !isImageOrPdf(file)) return "Only a photo or a PDF can be uploaded";
  return null;
}

/** The file as the API takes it: its name and its bytes in base64. */
export async function readUpload(file: File): Promise<{ fileName: string; fileBase64: string }> {
  return { fileName: file.name, fileBase64: await fileToBase64(file) };
}
