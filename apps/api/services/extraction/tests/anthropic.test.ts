import { beforeEach, describe, expect, it, vi } from "vitest";

// The SDK is replaced by a client that records how it was made and what it was asked.
const sdk = vi.hoisted(() => ({ options: [] as Record<string, unknown>[], create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: sdk.create };
    constructor(options: Record<string, unknown>) {
      sdk.options.push(options);
    }
  },
}));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-key" }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn() } }));

import { askAi, getClient, replyTimeoutMs } from "../lib/anthropic";

const params = (max_tokens: number) => ({ model: "test", max_tokens, messages: [{ role: "user" as const, content: "Read this." }] });

beforeEach(() => {
  sdk.options = [];
  sdk.create.mockReset();
});

describe("the extraction's AI client", () => {
  it("waits a bounded time and tries a request once more - not the SDK's 10 minutes tried three times", () => {
    getClient();
    expect(sdk.options[0]).toMatchObject({ apiKey: "test-key", maxRetries: 1, timeout: replyTimeoutMs(8192) });
    expect(replyTimeoutMs(8192)).toBeLessThan(5 * 60_000);
  });

  it("gives a request as long as its reply may take: a page classification less than a long reading", async () => {
    sdk.create.mockResolvedValue({ content: [] });
    await askAi(params(2048), "page classification");
    await askAi(params(8192), "pre-alert reading");
    expect(sdk.create.mock.calls.map((call) => call[1])).toEqual([{ timeout: replyTimeoutMs(2048) }, { timeout: replyTimeoutMs(8192) }]);
    expect(replyTimeoutMs(2048)).toBeLessThan(replyTimeoutMs(8192));
  });

  it("answers an AI that does not reply as unavailable, not as an internal error", async () => {
    sdk.create.mockRejectedValue(new Error("Request timed out."));
    await expect(askAi(params(2048), "page classification")).rejects.toMatchObject({ name: "APIError", code: "unavailable" });
  });
});
