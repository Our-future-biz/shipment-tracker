import type { ManifestDoc } from "./ltlDocumentTypes";

// STUB: the real builder (the run / line-haul manifest, nakládací list) comes from the documents
// branch and replaces this file at merge.
export async function buildManifestPdf(_doc: ManifestDoc): Promise<Uint8Array> {
  throw new Error("The manifest PDF is not built yet");
}
