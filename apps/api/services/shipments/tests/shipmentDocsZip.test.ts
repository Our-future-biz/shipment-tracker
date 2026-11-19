import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  COMMERCIAL_PAPERWORK,
  HOUSE_BOLS,
  SHIPMENT_DOCS_ZIP_MAX_BYTES,
  shipmentDocEntryNames,
  shipmentDocsTooLarge,
  shipmentDocsZip,
  shipmentDocsZipName,
} from "../lib/shipmentDocsZip";

describe("a master job's shipment documents in one ZIP", () => {
  it("are flat for the house BLs, each file named with its shipment's job number, unique and without folders", () => {
    expect(
      shipmentDocEntryNames(
        [
          { jobNumber: "CZLCL00000052", fileName: "HBL.pdf" },
          { jobNumber: "CZLCL00000052", fileName: "hbl.pdf" },
          { jobNumber: "CZLCL00000052", fileName: "HBL.pdf" },
          { jobNumber: "CZLCL00000053", fileName: "HBL.pdf" },
          { jobNumber: "CZLCL00000054", fileName: "../draft: v2" },
        ],
        HOUSE_BOLS.layout,
      ),
    ).toEqual([
      "CZLCL00000052 - HBL.pdf",
      "CZLCL00000052 - hbl (2).pdf",
      "CZLCL00000052 - HBL (3).pdf",
      "CZLCL00000053 - HBL.pdf",
      // No folders and no characters a file name can't hold.
      "CZLCL00000054 - .._draft_ v2",
    ]);
  });

  it("are in a folder per shipment for the commercial paperwork, the same name allowed once in each", () => {
    expect(
      shipmentDocEntryNames(
        [
          { jobNumber: "CZLCL00000052", fileName: "Invoice.pdf" },
          { jobNumber: "CZLCL00000052", fileName: "Invoice.pdf" },
          { jobNumber: "CZLCL00000053", fileName: "Invoice.pdf" },
          { jobNumber: "CZ/LCL", fileName: ".hidden" },
        ],
        COMMERCIAL_PAPERWORK.layout,
      ),
    ).toEqual(["CZLCL00000052/Invoice.pdf", "CZLCL00000052/Invoice (2).pdf", "CZLCL00000053/Invoice.pdf", "CZ_LCL/.hidden"]);
  });

  it("hold every file's bytes under its name", () => {
    const zip = shipmentDocsZip(
      [
        { jobNumber: "CZLCL00000052", fileName: "PL.pdf", bytes: Buffer.from("%PDF-52") },
        { jobNumber: "CZLCL00000053", fileName: "PL.pdf", bytes: Buffer.from("%PDF-53") },
      ],
      "folders",
    );
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files)).toEqual(["CZLCL00000052/PL.pdf", "CZLCL00000053/PL.pdf"]);
    expect(strFromU8(files["CZLCL00000053/PL.pdf"]!)).toBe("%PDF-53");
  });

  it("store the files as they are, not deflated: PDFs and images are compressed already", () => {
    const bytes = Buffer.alloc(10_000, "a");
    const zip = shipmentDocsZip([{ jobNumber: "CZLCL00000052", fileName: "HBL.pdf", bytes }], "flat");
    // The local file header's compression method (offset 8) is 0, "stored", and the bytes are all there.
    expect(zip.readUInt16LE(8)).toBe(0);
    expect(zip.length).toBeGreaterThan(bytes.length);
  });

  it("hold at most 100 MB, and say so with the size when the files come to more", () => {
    const MB = 1024 * 1024;
    expect(SHIPMENT_DOCS_ZIP_MAX_BYTES).toBe(100 * MB);
    expect(shipmentDocsTooLarge(100 * MB)).toBeNull();
    expect(shipmentDocsTooLarge(100 * MB + 1)).toBe("These documents come to 101 MB, more than 100 MB in one download: download them per shipment");
    expect(shipmentDocsTooLarge(240 * MB)).toBe("These documents come to 240 MB, more than 100 MB in one download: download them per shipment");
  });

  it("are named after the master job and what is in them", () => {
    expect(shipmentDocsZipName("MCZFULL00000006", HOUSE_BOLS)).toBe("MCZFULL00000006 House BLs.zip");
    expect(shipmentDocsZipName("MCZFULL00000006", COMMERCIAL_PAPERWORK)).toBe("MCZFULL00000006 Commercial paperwork.zip");
  });

  it("take the Commercial Documents group for the commercial paperwork", () => {
    expect(COMMERCIAL_PAPERWORK.types).toEqual(["Invoice", "Packing list"]);
    expect(HOUSE_BOLS.types).toEqual(["Bill of Lading"]);
  });
});
