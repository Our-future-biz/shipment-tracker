import { describe, expect, it } from "vitest";
import { decodeText, delimiterOf, extensionOf, formatSheetCell, parseDelimited, previewTypeOf, sniffBytes } from "./filePreview";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const PDF = text("%PDF-1.7\n...");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const HEIC = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);
// "BM", file size, two reserved zero words, pixel offset, then a 40-byte DIB header.
const BMP = bytes(0x42, 0x4d, 0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 40, 0, 0, 0);
const TIFF = bytes(0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0);

describe("what the bytes are", () => {
  it("reads the signatures of the types the app can show", () => {
    expect(sniffBytes(PDF)).toBe("pdf");
    expect(sniffBytes(PNG)).toBe("png");
    expect(sniffBytes(JPEG)).toBe("jpeg");
    expect(sniffBytes(BMP)).toBe("bmp");
    expect(sniffBytes(TIFF)).toBe("tiff");
    expect(sniffBytes(HEIC)).toBe("heic");
    expect(sniffBytes(ZIP)).toBe("zip");
    expect(sniffBytes(OLE)).toBe("ole");
    expect(sniffBytes(text("hello"))).toBeNull();
  });

  it("finds a PDF that a writer put a byte order mark or a line in front of", () => {
    expect(sniffBytes(bytes(0xef, 0xbb, 0xbf, ...text("%PDF-1.4")))).toBe("pdf");
    expect(sniffBytes(text("\r\n%PDF-1.4"))).toBe("pdf");
  });

  it("does not take text that starts with BM for a picture", () => {
    expect(sniffBytes(text("BMOU1234565;40HC;Hamburg"))).toBeNull();
    expect(previewTypeOf(text("BMOU1234565;40HC\nMSCU7654321;20DV"), "containers.csv").kind).toBe("csv");
  });
});

describe("how a file is shown", () => {
  it("goes by the bytes before the name or the stored type", () => {
    // A PDF stored without a type, or sent as a download, is still shown as a PDF.
    expect(previewTypeOf(PDF, "scan", "application/octet-stream")).toEqual({ kind: "pdf", mime: "application/pdf" });
    // A ".pdf" that is no PDF never goes into a PDF frame.
    expect(previewTypeOf(text("<html><script>x</script>"), "invoice.pdf", "application/pdf").kind).toBe("none");
    expect(previewTypeOf(JPEG, "photo.bin", "")).toEqual({ kind: "image", mime: "image/jpeg" });
    expect(previewTypeOf(TIFF, "scan.tif")).toEqual({ kind: "image", mime: "image/tiff" });
  });

  it("tells Word and Excel from other ZIP archives, and leaves the old Office formats to a download", () => {
    expect(previewTypeOf(ZIP, "Packing list.xlsx").kind).toBe("xlsx");
    expect(previewTypeOf(ZIP, "Offer.DOCX").kind).toBe("docx");
    expect(previewTypeOf(ZIP, "export", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").kind).toBe("xlsx");
    expect(previewTypeOf(ZIP, "photos.zip").kind).toBe("none");
    expect(previewTypeOf(OLE, "old.xls").kind).toBe("none");
    expect(previewTypeOf(OLE, "mail.msg").kind).toBe("none");
  });

  it("shows text and tables, an SVG only as a picture, and nothing else that is binary", () => {
    expect(previewTypeOf(text("a;b\n1;2"), "export.csv").kind).toBe("csv");
    expect(previewTypeOf(text("note"), "readme.TXT").kind).toBe("text");
    expect(previewTypeOf(text("{}"), "data", "application/json").kind).toBe("text");
    expect(previewTypeOf(text("<svg/>"), "logo.svg")).toEqual({ kind: "image", mime: "image/svg+xml" });
    expect(previewTypeOf(bytes(1, 0, 2, 0), "blob.dat").kind).toBe("none");
  });

  it("never hands an HTML or other unknown file a type a page could run, only a download", () => {
    expect(previewTypeOf(text("<html></html>"), "page.html", "text/html")).toEqual({ kind: "none", mime: "application/octet-stream" });
  });

  it("reads UTF-16 text (Excel's Unicode Text) as text", () => {
    const utf16 = bytes(0xff, 0xfe, 0x41, 0, 0x09, 0, 0x42, 0);
    expect(previewTypeOf(utf16, "list.txt").kind).toBe("text");
    expect(decodeText(utf16)).toBe("A\tB");
  });
});

describe("file names", () => {
  it("give their extension", () => {
    expect(extensionOf("MBL.Final.PDF")).toBe("pdf");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".env")).toBe("");
  });
});

describe("text", () => {
  it("reads UTF-8 without its byte order mark, and Windows-1250 where UTF-8 does not read", () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, ...text("Plzeň")))).toBe("Plzeň");
    // "Plzeň" saved as Windows-1250: ň is 0xF2.
    expect(decodeText(bytes(0x50, 0x6c, 0x7a, 0x65, 0xf2))).toBe("Plzeň");
  });

  it("keeps UTF-8 when the cut of a big file falls inside a character", () => {
    const whole = text("Plzeň, zásilka – ň");
    expect(decodeText(whole.subarray(0, whole.length - 1), true)).toBe("Plzeň, zásilka – ");
  });

  it("keeps a UTF-8 file UTF-8 when one stray byte in it doesn't read", () => {
    const mixed = bytes(...text("Plzeň, Ústí, Žďár, Brno "), 0xf2);
    expect(decodeText(mixed).startsWith("Plzeň, Ústí, Žďár")).toBe(true);
  });
});

describe("CSV", () => {
  it("finds the separator Excel used", () => {
    expect(delimiterOf("a;b;c\n1;2;3")).toBe(";");
    expect(delimiterOf("a,b\n1,2")).toBe(",");
    expect(delimiterOf("a\tb")).toBe("\t");
    expect(delimiterOf("single column")).toBe(",");
  });

  it("is not misled by commas in Czech text or decimals", () => {
    expect(delimiterOf("Popis (materiál, rozměr, barva);Množství\nLožisko, kuličkové;12,5\nPřevodovka;3,75")).toBe(";");
    expect(delimiterOf('"Acme, s.r.o.";Praha\n"Beta, a.s.";Brno')).toBe(";");
  });

  it("reads quoted fields with separators, line breaks and quotes in them", () => {
    expect(parseDelimited('name;note\r\n"Acme; s.r.o.";"line 1\nline 2"\n"say ""hi""";\n')).toEqual([
      ["name", "note"],
      ["Acme; s.r.o.", "line 1\nline 2"],
      ['say "hi"', ""],
    ]);
  });

  it("stops after the rows asked for", () => {
    expect(parseDelimited("1\n2\n3\n4", ",", 2)).toEqual([["1"], ["2"]]);
  });
});

describe("Excel cells", () => {
  it("show dates as the app does, on the minute Excel shows", () => {
    expect(formatSheetCell(new Date(Date.UTC(2026, 10, 3)))).toBe("03.11.2026");
    // Read a hair before 14:30.
    expect(formatSheetCell(new Date(Date.UTC(2024, 0, 15, 14, 29, 59, 999)))).toBe("15.01.2024 14:30");
  });

  it("show a time of day or a duration as hours and minutes, not an 1899 date", () => {
    expect(formatSheetCell(new Date(Date.UTC(1899, 11, 30, 14, 30)))).toBe("14:30");
    expect(formatSheetCell(new Date(Date.UTC(1899, 11, 31, 12, 30)))).toBe("36:30");
  });

  it("show numbers without floating-point noise, and nothing for what can't be read", () => {
    expect(formatSheetCell(3 * 1.1)).toBe("3.3");
    expect(formatSheetCell(0.1 + 0.2)).toBe("0.3");
    expect(formatSheetCell(1250)).toBe("1250");
    expect(formatSheetCell(true)).toBe("TRUE");
    expect(formatSheetCell(new Date(Number.NaN))).toBe("");
    expect(formatSheetCell(null)).toBe("");
  });
});
