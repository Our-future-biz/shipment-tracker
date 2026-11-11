import { describe, expect, it, vi } from "vitest";

// The Encore runtime and the AI client aren't loaded under vitest.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
// The classifier answers each page by its number, as the real one does (classesByPage).
vi.mock("../services/extraction.service", () => ({ classifyPages: vi.fn(async (pages: { pageNum: number }[]) => pages.map((p) => ({ page: p.pageNum, type: "HBL", ref: "" }))), extractFromPages: vi.fn() }));
// A PDF splits into as many pages as its "content" says - refused, as the real one is, past `maxPages`.
vi.mock("../lib/pdf", () => {
  class TooManyPagesError extends Error {
    constructor(readonly pageCount: number) {
      super(`The PDF has ${pageCount} pages`);
    }
  }
  return {
    detectMediaType: () => "application/pdf",
    TooManyPagesError,
    splitPdfToPages: vi.fn(async (base64: string, maxPages = Number.POSITIVE_INFINITY) => {
      if (Number(base64) > maxPages) throw new TooManyPagesError(Number(base64));
      return Array.from({ length: Number(base64) }, (_, i) => `page-${i}`);
    }),
  };
});
vi.mock("../services/places.service", () => ({ canonicalizeRecords: vi.fn() }));

import { extractHblBatch, extractMbl, MAX_PAGES, ownsSession, prepare } from "../services/pipeline.service";
import { classifyPages, extractFromPages } from "../services/extraction.service";
import { APIError } from "../../../lib/tests/encoreApi.stub";
import { splitPdfToPages } from "../lib/pdf";

const alice = { companyId: "c1", userId: "u1" };

describe("pipeline sessions", () => {
  it("belong to the user and company that started them", () => {
    expect(ownsSession({ owner: alice }, alice)).toBe(true);
    expect(ownsSession({ owner: alice }, { companyId: "c1", userId: "u2" })).toBe(false);
    expect(ownsSession({ owner: alice }, { companyId: "c2", userId: "u1" })).toBe(false);
  });

  it("report an unknown session as not found", async () => {
    await expect(extractMbl("pipe-missing", alice)).rejects.toThrow("Pipeline session not found or expired");
  });
});

describe("what one pre-alert may cost", () => {
  const pdf = (pages: number) => ({ fileBase64: String(pages), fileName: `${pages}.pdf` });

  it("refuses a pre-alert of more pages than MAX_PAGES, before any page is read", async () => {
    await expect(prepare([pdf(MAX_PAGES), pdf(1)], { companyId: "c1", userId: "big-reader" })).rejects.toThrow(`at most ${MAX_PAGES} pages`);
  });

  it("counts a PDF's pages before splitting it: only the pages left of the limit may be split", async () => {
    vi.mocked(splitPdfToPages).mockClear();
    await expect(prepare([pdf(150), pdf(40_000)], { companyId: "c1", userId: "blank-pages" })).rejects.toThrow(`at most ${MAX_PAGES} pages`);
    expect(vi.mocked(splitPdfToPages).mock.calls.map((c) => c[1])).toEqual([MAX_PAGES, MAX_PAGES - 150]);
  });

  it("reads each part of a pre-alert once: asked again, it answers what it read without another paid call", async () => {
    const carol = { companyId: "c1", userId: "carol" };
    vi.mocked(classifyPages).mockResolvedValueOnce([{ page: 1, type: "MBL", ref: "" }, { page: 2, type: "HBL", ref: "H1" }]);
    const { sessionId } = await prepare([pdf(2)], carol);
    vi.mocked(extractFromPages).mockClear();
    // One record per part (extractFromPages reads one object), no longer a list of them.
    vi.mocked(extractFromPages).mockResolvedValueOnce({ "MBL Number": "MSCU1" }).mockResolvedValueOnce({ Shipper: "ACME", "Personal Reference": "H1" });
    const mbl = await extractMbl(sessionId, carol);
    expect(await extractMbl(sessionId, carol)).toEqual(mbl);
    const first = await extractHblBatch(sessionId, 0, carol);
    const again = await extractHblBatch(sessionId, 0, carol);
    expect(again.shipments).toEqual(first.shipments);
    // One call for the MBL, one for the House B/L; the session holds the shipment once.
    expect(extractFromPages).toHaveBeenCalledTimes(2);
    expect(again.totalExtracted).toBe(1);
  });

  it("keeps at most 3 sessions per user: a new one drops the user's oldest", async () => {
    const bob = { companyId: "c1", userId: "bob" };
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await prepare([pdf(1)], bob)).sessionId);
    await expect(extractMbl(ids[0]!, bob)).rejects.toThrow("Pipeline session not found or expired");
    await expect(extractMbl(ids[1]!, bob)).resolves.toBeDefined();
  });
});

describe("reading a pre-alert's parts", () => {
  const pdf = (pages: number) => ({ fileBase64: String(pages), fileName: `${pages}.pdf` });

  it("files each page under the class given for its number: a page the classifier left out shifts no other", async () => {
    // Out of order, page 2 missing: page 3 is still the Master B/L, page 2 a House B/L by default.
    vi.mocked(classifyPages).mockResolvedValueOnce([{ page: 3, type: "MBL", ref: "" }, { page: 1, type: "HBL", ref: "H1" }]);
    const prep = await prepare([pdf(3)], { companyId: "c1", userId: "dora" });
    expect(prep.pages.map((p) => p.type)).toEqual(["HBL", "HBL", "MBL"]);
    expect(prep.classification).toMatchObject({ HBL: 2, MBL: 1 });
    // Page 2 has no number of its own: it continues House B/L H1 on the page before it.
    expect(prep.hblCount).toBe(1);
  });

  it("ends the reading as unavailable when the AI does not answer a chunk, without asking for the rest", async () => {
    vi.mocked(classifyPages).mockClear();
    vi.mocked(classifyPages).mockRejectedValueOnce(APIError.unavailable("The AI could not read the document just now."));
    // 20 pages are three chunks of at most 8.
    await expect(prepare([pdf(20)], { companyId: "c1", userId: "erik" })).rejects.toMatchObject({ code: "unavailable" });
    expect(classifyPages).toHaveBeenCalledTimes(1);
  });

  it("makes no shipment of a House B/L nothing was read from, and shares nothing of a Master B/L nothing was read from", async () => {
    const fay = { companyId: "c1", userId: "fay" };
    vi.mocked(classifyPages).mockResolvedValueOnce([
      { page: 1, type: "MBL", ref: "" },
      { page: 2, type: "HBL", ref: "H1" },
      { page: 3, type: "HBL", ref: "H2" },
    ]);
    const { sessionId } = await prepare([pdf(3)], fay);
    vi.mocked(extractFromPages).mockReset();
    vi.mocked(extractFromPages).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ Shipper: "ACME", "Personal Reference": "H2" });
    expect(await extractMbl(sessionId, fay)).toEqual({ mblInfo: null });
    const batch = await extractHblBatch(sessionId, 0, fay);
    expect(batch.shipments).toEqual([{ Shipper: "ACME", "Personal Reference": "H2" }]);
    expect(batch.documents).toHaveLength(1);
    expect(batch.totalExtracted).toBe(1);
  });
});
