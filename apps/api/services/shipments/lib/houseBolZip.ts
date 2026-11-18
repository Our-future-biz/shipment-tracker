import { zipSync } from "fflate";

// A master job's "Download House BLs": the Bills of Lading of its linked shipments in one ZIP, each
// file named with its shipment's job number so the houses can be told apart once unpacked.

/** The document type a house's Bill of Lading is filed under on a shipment's Documents tab. */
export const HOUSE_BOL_TYPE = "Bill of Lading";

export interface HouseBolFile {
  jobNumber: string;
  fileName: string;
  bytes: Uint8Array;
}

/** Characters that are no part of a file name on Windows or macOS, or would make a folder in the ZIP. */
const UNSAFE = /[/\\:*?"<>|\u0000-\u001f]/g;

/** The ZIP's name: the master job's number and what is in it. */
export const houseBolZipName = (mczNumber: string) => `${(mczNumber || "Master job").replace(UNSAFE, "_")} House BLs.zip`;

/**
 * Each file's name in the ZIP: "<job number> - <file name>", flat (no folders), and unique, a
 * second file of the same name getting " (2)" before its extension.
 */
export function houseBolEntryNames(files: Pick<HouseBolFile, "jobNumber" | "fileName">[]): string[] {
  const used = new Set<string>();
  return files.map(({ jobNumber, fileName }) => {
    const base = `${jobNumber.trim() || "Shipment"} - ${fileName.trim() || "Bill of Lading"}`.replace(UNSAFE, "_");
    const dot = base.lastIndexOf(".");
    const [stem, ext] = dot > base.indexOf(" - ") + 2 ? [base.slice(0, dot), base.slice(dot)] : [base, ""];
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** The files as one ZIP. */
export function houseBolZip(files: HouseBolFile[]): Buffer {
  const names = houseBolEntryNames(files);
  return Buffer.from(zipSync(Object.fromEntries(files.map((f, i) => [names[i], f.bytes]))));
}
