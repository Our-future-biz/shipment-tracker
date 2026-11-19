import type { interfaces } from "@/lib/api/client";

// What the master job's downloads of its linked shipments' documents say once the ZIP was asked for
// ("Download House BLs", "Download all commercial paperwork"): what came down, which shipments
// have none of those files, and what was left out on purpose (a cancelled house, paperwork customs
// declined), so nobody takes the ZIP for complete.

/** How a download's files are named in its message. */
export interface DocsDownloadWords {
  one: string;
  many: string;
  /** Ends in "on", the shipments' job numbers following. */
  missing: string;
}

export const HOUSE_BOL_WORDS: DocsDownloadWords = { one: "Bill of Lading", many: "Bills of Lading", missing: "No Bill of Lading on" };
const HOUSE_AWB_WORDS: DocsDownloadWords = { one: "Air Waybill", many: "Air Waybills", missing: "No Air Waybill on" };
const CMR_WORDS: DocsDownloadWords = { one: "CMR", many: "CMRs", missing: "No CMR on" };

export const COMMERCIAL_PAPERWORK_WORDS: DocsDownloadWords = {
  one: "commercial document",
  many: "commercial documents",
  missing: "No Commercial Invoice or packing list on",
};

/** The house transport documents' button for a master job of this mode, as the server picks them (shipments lib/shipmentDocsZip houseTransportDocs). */
export interface HouseDocsDownload {
  label: string;
  hint: string;
  words: DocsDownloadWords;
}

/**
 * By air the houses' transport documents are their Air Waybills (filed as "Bill of Lading": there is
 * no AWB type), by road their CMRs (filed as "CMR / POD"), else their Bills of Lading.
 */
export function houseDocsDownload(freightMode: string | null | undefined): HouseDocsDownload {
  const mode = (freightMode ?? "").trim();
  if (/^air/i.test(mode)) {
    return { label: "Download House AWBs", hint: "The Air Waybills of every linked shipment (filed as Bill of Lading), in one ZIP", words: HOUSE_AWB_WORDS };
  }
  if (/^road/i.test(mode)) {
    return { label: "Download CMRs", hint: "The CMRs of every linked shipment (filed as CMR / POD), in one ZIP", words: CMR_WORDS };
  }
  return { label: "Download House BLs", hint: "The Bills of Lading of every linked shipment, in one ZIP", words: HOUSE_BOL_WORDS };
}

export interface DocsDownloadNotice {
  kind: "success" | "warning";
  text: string;
}

const list = (jobs: string[]) => jobs.join(", ");

/** The message to show for the server's answer. */
export function docsDownloadNotice(
  res: Pick<interfaces.MasterJobDocumentsZip, "file" | "fileCount" | "withoutFiles" | "unreadable"> & { leftOut?: string[] },
  words: DocsDownloadWords,
): DocsDownloadNotice {
  const leftOut = res.leftOut ?? [];
  const gaps = [
    res.withoutFiles.length ? `${words.missing} ${list(res.withoutFiles)}.` : "",
    res.unreadable.length ? `Could not be read: ${list(res.unreadable)}.` : "",
    // "Left out: CZ00000012 (cancelled); CZ00000013 - Invoice.pdf (declined by customs)."
    leftOut.length ? `Left out: ${leftOut.join("; ")}.` : "",
  ].filter(Boolean);
  if (!res.file) {
    if (!gaps.length) return { kind: "warning", text: "No shipments are linked to this master job." };
    return { kind: "warning", text: ["Nothing to download.", ...gaps].join(" ") };
  }
  const got = `${res.fileCount} ${res.fileCount === 1 ? words.one : words.many} downloaded.`;
  return gaps.length ? { kind: "warning", text: [got, ...gaps].join(" ") } : { kind: "success", text: got };
}
