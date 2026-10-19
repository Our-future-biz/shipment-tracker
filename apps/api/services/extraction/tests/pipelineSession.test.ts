import { describe, expect, it, vi } from "vitest";

// The Encore runtime and the AI client aren't loaded under vitest.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../services/extraction.service", () => ({ classifyPages: vi.fn(async (pages: unknown[]) => pages.map(() => ({ type: "HBL", ref: "" }))), extractFromPages: vi.fn() }));
// A PDF splits into as many pages as its "content" says.
vi.mock("../lib/pdf", () => ({
  detectMediaType: () => "application/pdf",
  splitPdfToPages: vi.fn(async (base64: string) => Array.from({ length: Number(base64) }, (_, i) => `page-${i}`)),
}));
vi.mock("../services/places.service", () => ({ canonicalizeRecords: vi.fn() }));

import { extractMbl, MAX_PAGES, ownsSession, prepare } from "../services/pipeline.service";

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

  it("keeps at most 3 sessions per user: a new one drops the user's oldest", async () => {
    const bob = { companyId: "c1", userId: "bob" };
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await prepare([pdf(1)], bob)).sessionId);
    await expect(extractMbl(ids[0]!, bob)).rejects.toThrow("Pipeline session not found or expired");
    await expect(extractMbl(ids[1]!, bob)).resolves.toBeDefined();
  });
});
