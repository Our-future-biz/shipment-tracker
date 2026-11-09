import { describe, expect, it } from "vitest";
import { dataUrlToBlob } from "./files";

describe("a base64 data URL as a Blob", () => {
  it("has the file's bytes and the type asked for, whatever the URL claims", async () => {
    const blob = dataUrlToBlob("data:text/html;base64,JVBERi0=", "application/pdf");
    expect(blob.type).toBe("application/pdf");
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe("%PDF-");
  });

  it("refuses anything else", () => {
    expect(() => dataUrlToBlob("https://example.com/a.pdf", "application/pdf")).toThrow();
    expect(() => dataUrlToBlob("data:text/plain,hello", "application/pdf")).toThrow();
  });
});
