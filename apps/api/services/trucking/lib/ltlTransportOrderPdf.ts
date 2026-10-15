import type { LtlTransportOrderDoc } from "./ltlDocumentTypes";

// STUB: the real builder (a transport order with every stop of an LTL trip) comes from the
// documents branch and replaces this file at merge.
export async function buildLtlTransportOrderPdf(_doc: LtlTransportOrderDoc): Promise<Uint8Array> {
  throw new Error("The LTL transport order PDF is not built yet");
}
