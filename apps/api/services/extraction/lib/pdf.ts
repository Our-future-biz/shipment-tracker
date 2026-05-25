import { PDFParse } from "pdf-parse";

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
