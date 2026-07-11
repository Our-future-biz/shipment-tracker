import { PDFParse } from "pdf-parse";
import { PDFDocument } from "pdf-lib";

// Split a multi-page PDF (base64) into an array of single-page PDFs (base64).
// Each page is a standalone PDF so it can be sent to Claude as its own document
// block, letting the pipeline classify and extract one page at a time.
export async function splitPdfToPages(fileBase64: string): Promise<string[]> {
  const bytes = Buffer.from(fileBase64, "base64");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const count = src.getPageCount();
  const pages: string[] = [];
  for (let i = 0; i < count; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    pages.push(await doc.saveAsBase64());
  }
  return pages;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    // pdf-parse v2 types mark load() as private but it's the public API
    await (parser as unknown as { load(): Promise<void> }).load();
    const result = await parser.getText();
    return result.text || "";
  } catch {
    return "";
  }
}

export function detectMediaType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export function isImageType(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}

export function isPdfType(mediaType: string): boolean {
  return mediaType === "application/pdf";
}
