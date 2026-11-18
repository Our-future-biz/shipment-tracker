import type { interfaces } from "@/lib/api/client";

// What the master job's downloads of its linked shipments' documents say once the ZIP was asked for
// ("Download House BLs", "Download all commercial paperwork"): what came down, and which shipments
// have none of those files, so nobody takes the ZIP for complete.

/** How a download's files are named in its message. */
export interface DocsDownloadWords {
  one: string;
  many: string;
  /** Ends in "on", the shipments' job numbers following. */
  missing: string;
}

export const HOUSE_BOL_WORDS: DocsDownloadWords = { one: "Bill of Lading", many: "Bills of Lading", missing: "No Bill of Lading on" };

export const COMMERCIAL_PAPERWORK_WORDS: DocsDownloadWords = {
  one: "commercial document",
  many: "commercial documents",
  missing: "No Commercial Invoice or packing list on",
};

export interface DocsDownloadNotice {
  kind: "success" | "warning";
  text: string;
}

const list = (jobs: string[]) => jobs.join(", ");

/** The message to show for the server's answer. */
export function docsDownloadNotice(
  res: Pick<interfaces.MasterJobDocumentsZip, "file" | "fileCount" | "withoutFiles" | "unreadable">,
  words: DocsDownloadWords,
): DocsDownloadNotice {
  const gaps = [
    res.withoutFiles.length ? `${words.missing} ${list(res.withoutFiles)}.` : "",
    res.unreadable.length ? `Could not be read: ${list(res.unreadable)}.` : "",
  ].filter(Boolean);
  if (!res.file) {
    if (!res.withoutFiles.length && !res.unreadable.length) return { kind: "warning", text: "No shipments are linked to this master job." };
    return { kind: "warning", text: ["Nothing to download.", ...gaps].join(" ") };
  }
  const got = `${res.fileCount} ${res.fileCount === 1 ? words.one : words.many} downloaded.`;
  return gaps.length ? { kind: "warning", text: [got, ...gaps].join(" ") } : { kind: "success", text: got };
}
