import { describe, expect, it } from "vitest";
import { DOWNLOAD_ONLY, servedFileType, sniffFileType, storedFileType } from "../../../lib/fileType";

const bytes = (...b: number[]) => Buffer.from(b);

describe("gate file types come from the bytes", () => {
  it("recognises photos and PDFs", () => {
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffFileType(Buffer.from("GIF89a"))).toBe("image/gif");
    expect(sniffFileType(Buffer.concat([Buffer.from("RIFF"), bytes(1, 2, 3, 4), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
    expect(sniffFileType(Buffer.concat([bytes(0, 0, 0, 24), Buffer.from("ftypheic")]))).toBe("image/heic");
    expect(sniffFileType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
  });

  it("stores and serves HTML, SVG and anything unknown as a download", () => {
    expect(storedFileType(Buffer.from("<html><script>alert(1)</script>"))).toBe(DOWNLOAD_ONLY);
    expect(storedFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).toBe(DOWNLOAD_ONLY);
    expect(servedFileType("text/html")).toBe(DOWNLOAD_ONLY);
    expect(servedFileType("image/svg+xml")).toBe(DOWNLOAD_ONLY);
    expect(servedFileType("image/png")).toBe("image/png");
  });
});
