import { zipSync } from "fflate";

// A master job's downloads of its linked shipments' documents in one ZIP, from its Documents tab:
// "Download House BLs" (flat, each file named with its shipment's job number) and "Download all
// commercial paperwork" (a folder per shipment). Either way the houses can be told apart unpacked.

/** A download: the document types it takes, what the ZIP is called after the master job, its layout. */
export interface ShipmentDocsDownload {
  types: readonly string[];
  /** After the master job's number in the ZIP's name: "MCZ… House BLs.zip". */
  title: string;
  /** "flat": "<job number> - <file name>"; "folders": "<job number>/<file name>". */
  layout: "flat" | "folders";
}

/** Each house's Bill of Lading, as filed on a shipment's Documents tab. */
export const HOUSE_BOLS: ShipmentDocsDownload = { types: ["Bill of Lading"], title: "House BLs", layout: "flat" };

/** The commercial paperwork: the Commercial Documents group, each house's Commercial Invoices and packing lists. */
export const COMMERCIAL_PAPERWORK: ShipmentDocsDownload = { types: ["Invoice", "Packing list"], title: "Commercial paperwork", layout: "folders" };

export interface ShipmentDocFile {
  jobNumber: string;
  fileName: string;
  bytes: Uint8Array;
}

/** Characters that are no part of a file name on Windows or macOS, or would make a folder in the ZIP. */
const UNSAFE = /[/\\:*?"<>|\u0000-\u001f]/g;
const safe = (name: string) => name.replace(UNSAFE, "_");

/** The ZIP's name: the master job's number and what is in it. */
export const shipmentDocsZipName = (mczNumber: string, download: ShipmentDocsDownload) => `${safe(mczNumber || "Master job")} ${download.title}.zip`;

/**
 * Each file's path in the ZIP, unique (a second file of the same name gets " (2)" before its
 * extension): "<job number> - <file name>" flat, or "<job number>/<file name>" in folders.
 */
export function shipmentDocEntryNames(files: Pick<ShipmentDocFile, "jobNumber" | "fileName">[], layout: ShipmentDocsDownload["layout"]): string[] {
  const used = new Set<string>();
  return files.map(({ jobNumber, fileName }) => {
    const job = safe(jobNumber.trim() || "Shipment");
    const file = safe(fileName.trim() || "Document");
    const [prefix, sep] = layout === "folders" ? [job, "/"] : [job, " - "];
    // A dot in front ("..", ".hidden") is no extension.
    const dot = file.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ""];
    let name = `${prefix}${sep}${file}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${prefix}${sep}${stem} (${n})${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** The files as one ZIP. */
export function shipmentDocsZip(files: ShipmentDocFile[], layout: ShipmentDocsDownload["layout"]): Buffer {
  const names = shipmentDocEntryNames(files, layout);
  return Buffer.from(zipSync(Object.fromEntries(files.map((f, i) => [names[i], f.bytes]))));
}
