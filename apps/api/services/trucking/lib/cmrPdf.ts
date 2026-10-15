import type { CmrDoc } from "./documentTypes";

// Stub: the real PDF builder (pdfkit) comes with the documents work and replaces this file.
export async function buildCmrPdf(doc: CmrDoc): Promise<Uint8Array> {
  void doc;
  throw new Error("not built yet");
}
