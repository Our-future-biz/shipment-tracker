import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { houseBolEntryNames, houseBolZip, houseBolZipName } from "../lib/houseBolZip";

describe("a master job's house BLs in one ZIP", () => {
  it("name each file with its shipment's job number, flat and unique", () => {
    expect(
      houseBolEntryNames([
        { jobNumber: "CZLCL00000052", fileName: "HBL.pdf" },
        { jobNumber: "CZLCL00000052", fileName: "hbl.pdf" },
        { jobNumber: "CZLCL00000052", fileName: "HBL.pdf" },
        { jobNumber: "CZLCL00000053", fileName: "HBL.pdf" },
        { jobNumber: "CZLCL00000054", fileName: "../draft: v2" },
      ]),
    ).toEqual([
      "CZLCL00000052 - HBL.pdf",
      "CZLCL00000052 - hbl (2).pdf",
      "CZLCL00000052 - HBL (3).pdf",
      "CZLCL00000053 - HBL.pdf",
      // No folders and no characters a file name can't hold; a dot in front is no extension.
      "CZLCL00000054 - .._draft_ v2",
    ]);
  });

  it("hold every file's bytes under its name", () => {
    const zip = houseBolZip([
      { jobNumber: "CZLCL00000052", fileName: "HBL.pdf", bytes: Buffer.from("%PDF-52") },
      { jobNumber: "CZLCL00000053", fileName: "HBL.pdf", bytes: Buffer.from("%PDF-53") },
    ]);
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files)).toEqual(["CZLCL00000052 - HBL.pdf", "CZLCL00000053 - HBL.pdf"]);
    expect(strFromU8(files["CZLCL00000053 - HBL.pdf"]!)).toBe("%PDF-53");
  });

  it("are named after the master job", () => {
    expect(houseBolZipName("MCZFULL00000006")).toBe("MCZFULL00000006 House BLs.zip");
  });
});
