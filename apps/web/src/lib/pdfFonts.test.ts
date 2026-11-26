import { afterEach, describe, expect, it, vi } from "vitest";
import { fontFile } from "./pdfFonts";

const reply = (bytes: Uint8Array, status = 200) => ({ ok: status < 400, status, arrayBuffer: async () => bytes.buffer });

describe("fontFile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads a font file as base64, a large one too", async () => {
    // Larger than one slice of 32 KiB, with every byte value in it.
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7) % 256);
    const fetch = vi.fn(async () => reply(bytes));
    vi.stubGlobal("fetch", fetch);
    expect(await fontFile("/fonts/DejaVuSans.ttf")).toBe(Buffer.from(bytes).toString("base64"));
    expect(fetch).toHaveBeenCalledWith("/fonts/DejaVuSans.ttf");
  });

  it("rejects a file that cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(new Uint8Array(), 404)));
    await expect(fontFile("/fonts/DejaVuSans-Bold.ttf")).rejects.toThrow("Font /fonts/DejaVuSans-Bold.ttf: 404");
  });
});
