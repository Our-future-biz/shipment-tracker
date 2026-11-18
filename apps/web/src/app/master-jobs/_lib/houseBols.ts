import type { interfaces } from "@/lib/api/client";

// What the master job's "Download House BLs" says after the ZIP of its houses' Bills of Lading was
// asked for: what came down, and which shipments have none, so nobody takes the ZIP for complete.

export interface HouseBolsNotice {
  kind: "success" | "warning";
  text: string;
}

const list = (jobs: string[]) => jobs.join(", ");

/** The message to show for the server's answer. */
export function houseBolsNotice(res: Pick<interfaces.MasterJobHouseBols, "file" | "fileCount" | "withoutBol" | "unreadable">): HouseBolsNotice {
  const gaps = [
    res.withoutBol.length ? `No Bill of Lading on ${list(res.withoutBol)}.` : "",
    res.unreadable.length ? `Could not be read: ${list(res.unreadable)}.` : "",
  ].filter(Boolean);
  if (!res.file) {
    if (!res.withoutBol.length && !res.unreadable.length) return { kind: "warning", text: "No shipments are linked to this master job." };
    return { kind: "warning", text: ["Nothing to download.", ...gaps].join(" ") };
  }
  const got = `${res.fileCount} ${res.fileCount === 1 ? "Bill of Lading" : "Bills of Lading"} downloaded.`;
  return gaps.length ? { kind: "warning", text: [got, ...gaps].join(" ") } : { kind: "success", text: got };
}
