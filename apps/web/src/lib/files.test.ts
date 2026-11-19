import { describe, expect, it } from "vitest";
import { base64ToBlob, dataUrlToBlob } from "./files";

describe("a base64 data URL as a Blob", () => {
  it("has the file's bytes and the type asked for, whatever the URL claims", async () => {
    const blob = dataUrlToBlob("data:text/html;base64,JVBERi0=", "application/pdf");
    expect(blob.type).toBe("application/pdf");
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe("%PDF-");
  });

  it("decodes plain base64 the same way, bytes above 127 included", async () => {
    const blob = base64ToBlob(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x80]).toString("base64"), "application/zip");
    expect(blob.type).toBe("application/zip");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0x50, 0x4b, 0x03, 0x04, 0xff, 0x80]);
  });

  it("refuses anything else", () => {
    expect(() => dataUrlToBlob("https://example.com/a.pdf", "application/pdf")).toThrow();
    expect(() => dataUrlToBlob("data:text/plain,hello", "application/pdf")).toThrow();
  });
});
