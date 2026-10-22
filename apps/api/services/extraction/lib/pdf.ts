import log from "encore.dev/log";
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

// Join pages (single-page PDFs, or JPG/PNG images) into one PDF (base64), in the given
// order. Used to keep the pages of one House B/L together as its own document.
export async function mergePagesToPdf(pages: { base64: string; mediaType: string }[]): Promise<string> {
  const doc = await PDFDocument.create();
  for (const { base64, mediaType } of pages) {
    const bytes = Buffer.from(base64, "base64");
    if (mediaType === "application/pdf") {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      for (const page of await doc.copyPages(src, src.getPageIndices())) doc.addPage(page);
    } else if (mediaType === "image/jpeg" || mediaType === "image/png") {
      const image = mediaType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      doc.addPage([image.width, image.height]).drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    } else {
      throw new Error(`A ${mediaType} page can't be put into a PDF`);
    }
  }
  return doc.saveAsBase64();
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    // pdf-parse v2 types mark load() as private but it's the public API
    await (parser as unknown as { load(): Promise<void> }).load();
    const result = await parser.getText();
    return result.text || "";
  } catch (err) {
    // No text layer to read (scanned or damaged PDF): the caller falls back to reading it as images.
    log.warn("pdf: text extraction failed", { error: err instanceof Error ? err.message : String(err) });
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
