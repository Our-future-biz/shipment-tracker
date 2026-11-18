import { describe, expect, it } from "vitest";
import { houseBolsNotice } from "./houseBols";

const FILE = { fileName: "MCZ House BLs.zip", contentType: "application/zip", fileBase64: "UEs=" };

describe("what Download House BLs says", () => {
  it("is a plain success when every linked shipment's BL came down", () => {
    expect(houseBolsNotice({ file: FILE, fileCount: 3, withoutBol: [], unreadable: [] })).toEqual({ kind: "success", text: "3 Bills of Lading downloaded." });
    expect(houseBolsNotice({ file: FILE, fileCount: 1, withoutBol: [], unreadable: [] }).text).toBe("1 Bill of Lading downloaded.");
  });

  it("warns about the shipments without one and the files that could not be read", () => {
    expect(houseBolsNotice({ file: FILE, fileCount: 2, withoutBol: ["CZFCL00000062", "CZFCL00000063"], unreadable: ["CZFCL00000060 - old.pdf"] })).toEqual({
      kind: "warning",
      text: "2 Bills of Lading downloaded. No Bill of Lading on CZFCL00000062, CZFCL00000063. Could not be read: CZFCL00000060 - old.pdf.",
    });
  });

  it("says why nothing came down", () => {
    expect(houseBolsNotice({ file: null, fileCount: 0, withoutBol: ["CZFCL00000062"], unreadable: [] })).toEqual({
      kind: "warning",
      text: "Nothing to download. No Bill of Lading on CZFCL00000062.",
    });
    expect(houseBolsNotice({ file: null, fileCount: 0, withoutBol: [], unreadable: [] }).text).toBe("No shipments are linked to this master job.");
  });
});
