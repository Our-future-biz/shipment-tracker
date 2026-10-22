import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePagesToPdf, splitPdfToPages } from "../lib/pdf";

// A PDF of `count` pages, each page `width` points wide so the pages can be told apart.
async function pdf(widths: number[]): Promise<string> {
  const doc = await PDFDocument.create();
  for (const width of widths) doc.addPage([width, 800]);
  return doc.saveAsBase64();
}

const widths = async (base64: string) =>
  (await PDFDocument.load(Buffer.from(base64, "base64"))).getPages().map((p) => p.getWidth());

describe("mergePagesToPdf", () => {
  it("joins the pages of one House B/L into one PDF, in order", async () => {
    const pages = await splitPdfToPages(await pdf([100, 200, 300, 400]));
    const merged = await mergePagesToPdf([pages[2], pages[1]].map((base64) => ({ base64, mediaType: "application/pdf" })));
    expect(await widths(merged)).toEqual([300, 200]);
  });

  it("refuses a page it can't put into a PDF", async () => {
    await expect(mergePagesToPdf([{ base64: "AAAA", mediaType: "image/webp" }])).rejects.toThrow();
  });
});
