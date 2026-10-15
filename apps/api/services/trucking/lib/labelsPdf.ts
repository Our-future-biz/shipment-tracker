import type { LabelDoc } from "./ltlDocumentTypes";

// STUB: the real builder (100×150 mm piece labels, one per page) comes from the documents branch
// and replaces this file at merge.
export async function buildLabelsPdf(_labels: LabelDoc[]): Promise<Uint8Array> {
  throw new Error("The labels PDF is not built yet");
}
