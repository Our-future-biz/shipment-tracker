import type { TransportOrderDoc } from "./documentTypes";

// Stub: the real PDF builder (pdfkit) comes with the documents work and replaces this file.
export async function buildTransportOrderPdf(doc: TransportOrderDoc): Promise<Uint8Array> {
  void doc;
  throw new Error("not built yet");
}
