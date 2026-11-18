import { describe, expect, it } from "vitest";
import { COMMERCIAL_PAPERWORK_WORDS, HOUSE_BOL_WORDS, docsDownloadNotice } from "./shipmentDocsDownload";

const FILE = { fileName: "MCZ House BLs.zip", contentType: "application/zip", fileBase64: "UEs=" };

describe("what a download of the linked shipments' documents says", () => {
  it("is a plain success when every linked shipment's files came down", () => {
    expect(docsDownloadNotice({ file: FILE, fileCount: 3, withoutFiles: [], unreadable: [] }, HOUSE_BOL_WORDS)).toEqual({ kind: "success", text: "3 Bills of Lading downloaded." });
    expect(docsDownloadNotice({ file: FILE, fileCount: 1, withoutFiles: [], unreadable: [] }, HOUSE_BOL_WORDS).text).toBe("1 Bill of Lading downloaded.");
    expect(docsDownloadNotice({ file: FILE, fileCount: 5, withoutFiles: [], unreadable: [] }, COMMERCIAL_PAPERWORK_WORDS).text).toBe("5 commercial documents downloaded.");
  });

  it("warns about the shipments without any and the files that could not be read", () => {
    expect(
      docsDownloadNotice({ file: FILE, fileCount: 2, withoutFiles: ["CZFCL00000062", "CZFCL00000063"], unreadable: ["CZFCL00000060 - old.pdf"] }, HOUSE_BOL_WORDS),
    ).toEqual({
      kind: "warning",
      text: "2 Bills of Lading downloaded. No Bill of Lading on CZFCL00000062, CZFCL00000063. Could not be read: CZFCL00000060 - old.pdf.",
    });
    expect(docsDownloadNotice({ file: FILE, fileCount: 1, withoutFiles: ["CZFCL00000062"], unreadable: [] }, COMMERCIAL_PAPERWORK_WORDS)).toEqual({
      kind: "warning",
      text: "1 commercial document downloaded. No Commercial Invoice or packing list on CZFCL00000062.",
    });
  });

  it("says why nothing came down", () => {
    expect(docsDownloadNotice({ file: null, fileCount: 0, withoutFiles: ["CZFCL00000062"], unreadable: [] }, HOUSE_BOL_WORDS)).toEqual({
      kind: "warning",
      text: "Nothing to download. No Bill of Lading on CZFCL00000062.",
    });
    expect(docsDownloadNotice({ file: null, fileCount: 0, withoutFiles: [], unreadable: [] }, COMMERCIAL_PAPERWORK_WORDS).text).toBe("No shipments are linked to this master job.");
  });
});
