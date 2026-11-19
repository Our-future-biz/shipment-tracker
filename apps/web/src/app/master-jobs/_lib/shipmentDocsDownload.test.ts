import { describe, expect, it } from "vitest";
import { COMMERCIAL_PAPERWORK_WORDS, HOUSE_BOL_WORDS, docsDownloadNotice, houseDocsDownload } from "./shipmentDocsDownload";

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

  it("names what was left out on purpose: a cancelled shipment, paperwork customs declined", () => {
    expect(
      docsDownloadNotice(
        { file: FILE, fileCount: 2, withoutFiles: [], unreadable: [], leftOut: ["CZ00000012 (cancelled)", "CZ00000013 - Invoice.pdf (declined by customs)"] },
        COMMERCIAL_PAPERWORK_WORDS,
      ),
    ).toEqual({ kind: "warning", text: "2 commercial documents downloaded. Left out: CZ00000012 (cancelled); CZ00000013 - Invoice.pdf (declined by customs)." });
    expect(docsDownloadNotice({ file: null, fileCount: 0, withoutFiles: [], unreadable: [], leftOut: ["CZ00000012 (cancelled)"] }, HOUSE_BOL_WORDS)).toEqual({
      kind: "warning",
      text: "Nothing to download. Left out: CZ00000012 (cancelled).",
    });
  });

  it("names the house documents by the master job's mode", () => {
    expect(houseDocsDownload("Air Freight")).toMatchObject({ label: "Download House AWBs" });
    expect(docsDownloadNotice({ file: FILE, fileCount: 2, withoutFiles: ["CZAIR00000003"], unreadable: [] }, houseDocsDownload("Air Freight").words).text).toBe(
      "2 Air Waybills downloaded. No Air Waybill on CZAIR00000003.",
    );
    expect(houseDocsDownload("Road Freight")).toMatchObject({ label: "Download CMRs" });
    expect(docsDownloadNotice({ file: FILE, fileCount: 1, withoutFiles: [], unreadable: [] }, houseDocsDownload("Road Freight").words).text).toBe("1 CMR downloaded.");
    expect(houseDocsDownload("Sea Freight")).toMatchObject({ label: "Download House BLs", words: HOUSE_BOL_WORDS });
    expect(houseDocsDownload("")).toMatchObject({ label: "Download House BLs" });
  });

  it("says why nothing came down", () => {
    expect(docsDownloadNotice({ file: null, fileCount: 0, withoutFiles: ["CZFCL00000062"], unreadable: [] }, HOUSE_BOL_WORDS)).toEqual({
      kind: "warning",
      text: "Nothing to download. No Bill of Lading on CZFCL00000062.",
    });
    expect(docsDownloadNotice({ file: null, fileCount: 0, withoutFiles: [], unreadable: [] }, COMMERCIAL_PAPERWORK_WORDS).text).toBe("No shipments are linked to this master job.");
  });
});
