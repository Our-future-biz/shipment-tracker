import { describe, expect, it, vi } from "vitest";

// The Encore runtime and the AI client aren't loaded under vitest.
vi.mock("encore.dev/api", () => ({ APIError: { notFound: (msg: string) => new Error(msg) } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../services/extraction.service", () => ({ classifyPages: vi.fn(), extractFromPages: vi.fn() }));
vi.mock("../services/places.service", () => ({ canonicalizeRecords: vi.fn() }));

import { extractMbl, ownsSession } from "../services/pipeline.service";

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
