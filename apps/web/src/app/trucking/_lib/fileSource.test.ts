import { describe, expect, it } from "vitest";
import { truckingFileBlob, truckingFileSource } from "./fileSource";

// "%PDF-1.7" and the bytes 0x00 / 0xff, which a text decode would spoil.
const PDF_HEAD = "JVBERi0xLjc=";
const BINARY = btoa(String.fromCharCode(0x00, 0xff, 0x10));

describe("truckingFileBlob", () => {
  it("decodes the server's base64 into the file's own bytes and type", async () => {
    const blob = truckingFileBlob({ fileName: "pod.pdf", fileBase64: PDF_HEAD, contentType: "application/pdf" });
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toBe("%PDF-1.7");
    const binary = new Uint8Array(await truckingFileBlob({ fileName: "x.bin", fileBase64: BINARY, contentType: "application/octet-stream" }).arrayBuffer());
    expect([...binary]).toEqual([0x00, 0xff, 0x10]);
  });

  it("calls a file with no type a download, never an Excel file", () => {
    expect(truckingFileBlob({ fileName: "x", fileBase64: BINARY, contentType: "" }).type).toBe("application/octet-stream");
  });
});

describe("truckingFileSource", () => {
  it("fetches the file only when the preview loads it, under the listed name", async () => {
    let calls = 0;
    const source = truckingFileSource("POD 123.pdf", async () => {
      calls++;
      return { fileName: "stored.pdf", fileBase64: PDF_HEAD, contentType: "application/pdf" };
    });
    expect(calls).toBe(0);
    expect(source.fileName).toBe("POD 123.pdf");
    if (!("load" in source)) throw new Error("expected a loader");
    expect(await (await source.load()).text()).toBe("%PDF-1.7");
    expect(calls).toBe(1);
  });
});
