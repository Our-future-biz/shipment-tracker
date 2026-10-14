import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listByQuoteNumber: vi.fn(),
  getByIdForCompany: vi.fn(),
  createForCompany: vi.fn(),
  softDeleteForCompany: vi.fn(),
  softDeleteByQuoteNumber: vi.fn(),
}));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
vi.mock("../repositories/quoteAttachment.repository", () => ({ quoteAttachmentRepository: repo }));
vi.mock("../storage/quoteAttachmentBucket", () => ({ quoteAttachmentBucket: bucket }));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/api", () => ({ APIError: { notFound: (msg: string) => new Error(msg) } }));

import { quoteAttachmentService } from "../services/quoteAttachment.service";

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1", companyId: "c1", quoteNumber: "Q1", fileName: "f.pdf", fileSize: 3, fileType: "application/pdf",
  storageKey: "c1/Q1/x", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
});
const tokenOf = (contentUrl: string) => decodeURIComponent(new URL(contentUrl, "http://x").searchParams.get("t") ?? "");

beforeEach(() => {
  vi.clearAllMocks();
  bucket.download.mockResolvedValue(Buffer.from("pdf"));
});

describe("quote attachment links", () => {
  it("list items carry a signed link that opens that file", async () => {
    repo.listByQuoteNumber.mockResolvedValue([row()]);
    const [item] = await quoteAttachmentService.list("Q1", "c1");
    expect(item).not.toHaveProperty("storageKey");
    expect(item!.contentUrl).toMatch(/^\/quotes\/Q1\/attachments\/a1\/content\?t=/);
    repo.getByIdForCompany.mockResolvedValue(row());
    const file = await quoteAttachmentService.getContent("Q1", "a1", tokenOf(item!.contentUrl));
    expect(file?.fileName).toBe("f.pdf");
    expect(repo.getByIdForCompany).toHaveBeenCalledWith("a1", "c1");
  });

  it("serves nothing without a token, for another file's token, or under another quote", async () => {
    repo.listByQuoteNumber.mockResolvedValue([row()]);
    const [item] = await quoteAttachmentService.list("Q1", "c1");
    repo.getByIdForCompany.mockResolvedValue(row());
    expect(await quoteAttachmentService.getContent("Q1", "a1", null)).toBeNull();
    expect(await quoteAttachmentService.getContent("Q1", "a2", tokenOf(item!.contentUrl))).toBeNull();
    expect(await quoteAttachmentService.getContent("Q2", "a1", tokenOf(item!.contentUrl))).toBeNull();
  });

  it("deleting a quote's attachments also removes their stored bytes", async () => {
    repo.softDeleteByQuoteNumber.mockResolvedValue(["k1", "k2"]);
    bucket.remove.mockRejectedValueOnce(new Error("gone"));
    await quoteAttachmentService.removeAllOfQuote("Q1", "c1");
    expect(bucket.remove).toHaveBeenCalledTimes(2);
  });
});
