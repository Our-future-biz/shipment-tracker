import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The quotes' chat, run for real against stand-ins for the repositories, the bucket and the users.
// What matters most: every revision of a quote is filed under, and reads, the original reference.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("../../../../lib/userNames", () => ({
  userNames: vi.fn(async () => new Map([["u-me", "Lukas Slavik"], ["u-eva", "Eva Novak"]])),
}));
vi.mock("../../storage/quoteAttachmentBucket", () => ({ quoteAttachmentBucket: { upload: vi.fn(), download: vi.fn() } }));
vi.mock("../../repositories/salesQuote.repository", () => ({ salesQuoteRepository: { loadSales: vi.fn() } }));
vi.mock("../../repositories/quoteComment.repository", () => ({
  quoteCommentRepository: {
    listByThread: vi.fn(),
    listChatFiles: vi.fn(),
    lastReadByOthers: vi.fn(),
    createForCompany: vi.fn(),
    linkFiles: vi.fn(),
    createFile: vi.fn(),
    deleteOwn: vi.fn(),
    markRead: vi.fn(),
    unreadCounts: vi.fn(),
    mentions: vi.fn(),
  },
}));

import { salesQuoteRepository } from "../../repositories/salesQuote.repository";
import { quoteCommentRepository } from "../../repositories/quoteComment.repository";
import { quoteChatService, READ_MENTION_KEEP_DAYS, threadOf } from "../../services/quoteChat.service";
import type { Actor } from "../../../../lib/rbac";

const quotes = vi.mocked(salesQuoteRepository);
const repo = vi.mocked(quoteCommentRepository);
const me: Actor = { userID: "u-me", companyID: "c1", role: "user" } as Actor;
const ROOT = "QCZ20261022003";

beforeEach(() => {
  vi.resetAllMocks();
  quotes.loadSales.mockImplementation(async (_c, quoteNumber) => ({ quoteNumber }) as never);
  repo.listByThread.mockResolvedValue([]);
  repo.listChatFiles.mockResolvedValue([]);
  repo.lastReadByOthers.mockResolvedValue(null);
});

describe("the thread of a quote", () => {
  it("is the original Sales Reference for every revision; a variant has its own", () => {
    expect(threadOf(ROOT)).toBe(ROOT);
    expect(threadOf(`${ROOT}-R1`)).toBe(ROOT);
    expect(threadOf(`${ROOT}-R12`)).toBe(ROOT);
    expect(threadOf(`${ROOT}-2`)).toBe(`${ROOT}-2`);
    expect(threadOf(`${ROOT}-2-R1`)).toBe(`${ROOT}-2`);
  });

  it("a revision reads and writes the original's thread, and marks it read", async () => {
    await quoteChatService.list(me, `${ROOT}-R2`);
    expect(repo.listByThread).toHaveBeenCalledWith("c1", ROOT);
    repo.createForCompany.mockImplementation(async (_c, row) => ({ id: "m1", companyId: "c1", createdAt: new Date("2026-10-23T10:00:00Z"), ...row }) as never);
    const item = await quoteChatService.create(me, `${ROOT}-R2`, { message: "hello @Eva Novak", fileIds: ["f1", "f1"], mentionedUserIds: ["u-eva", "u-me", "u-stranger"] });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", { threadRef: ROOT, quoteNumber: `${ROOT}-R2`, authorId: "u-me", message: "hello @Eva Novak", mentionedUserIds: ["u-eva"] });
    expect(repo.linkFiles).toHaveBeenCalledWith("c1", ROOT, ["f1"], "m1");
    expect(item).toMatchObject({ quoteNumber: `${ROOT}-R2`, threadRef: ROOT, authorName: "Lukas Slavik" });
    await quoteChatService.markRead(me, `${ROOT}-R1`);
    expect(repo.markRead).toHaveBeenCalledWith("c1", "u-me", ROOT);
  });

  it("refuses a quote that is not there, and an empty message", async () => {
    quotes.loadSales.mockResolvedValue(null);
    await expect(quoteChatService.list(me, "QCZX")).rejects.toMatchObject({ code: "not_found" });
    quotes.loadSales.mockImplementation(async (_c, quoteNumber) => ({ quoteNumber }) as never);
    await expect(quoteChatService.create(me, ROOT, { message: "  ", fileIds: [], mentionedUserIds: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.createForCompany).not.toHaveBeenCalled();
  });

  it("deletes only the author's own message", async () => {
    repo.deleteOwn.mockResolvedValue(false);
    await expect(quoteChatService.delete(me, `${ROOT}-R1`, "m9")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.deleteOwn).toHaveBeenCalledWith("c1", ROOT, "m9", "u-me");
  });
});

describe("files and mentions", () => {
  it("takes a file as large as the shipments chat does, and a file needs a name", () => {
    // 50 MiB of body, as /shipments/:shipmentId/attachments allows (base64 inflates bytes ~33%).
    const src = readFileSync(path.join(__dirname, "../../controllers/quoteChat.controller.ts"), "utf8");
    const upload = src.slice(src.indexOf("interface QuoteChatFileUploadRequest"), src.indexOf("quoteCommentUnread"));
    expect(upload).toMatch(/bodyLimit: 50 \* 1024 \* 1024/);
    expect(upload).toMatch(/fileName: string & MinLen<1>/);
    expect(upload).toMatch(/fileSize: number & Min<0>/);
  });

  it("each file gets a download link with a token", async () => {
    repo.listByThread.mockResolvedValue([{ id: "m1", companyId: "c1", threadRef: ROOT, quoteNumber: ROOT, authorId: "u-eva", message: "see file", createdAt: new Date() }] as never);
    repo.listChatFiles.mockResolvedValue([{ id: "f1", commentId: "m1", fileName: "plan.pdf", fileSize: 10, fileType: "application/pdf" }] as never);
    const [m] = await quoteChatService.list(me, ROOT);
    expect(m!.attachments[0]).toMatchObject({ id: "f1", fileName: "plan.pdf" });
    expect(m!.attachments[0]!.contentUrl).toMatch(/^\/sales-quote-chat-files\/f1\/content\?t=/);
  });

  it("the bell gets unread mentions and read ones of the last 7 days, saying which", async () => {
    repo.mentions.mockResolvedValue([
      { id: "a", threadRef: ROOT, quoteNumber: `${ROOT}-R1`, authorId: "u-eva", message: "@you", createdAt: new Date("2026-10-23T10:00:00Z"), readAt: new Date("2026-10-23T09:00:00Z") },
      { id: "b", threadRef: ROOT, quoteNumber: ROOT, authorId: "u-eva", message: "@you", createdAt: new Date("2026-10-20T10:00:00Z"), readAt: new Date("2026-10-21T09:00:00Z") },
    ] as never);
    const mentions = await quoteChatService.mentions(me);
    expect(repo.mentions).toHaveBeenCalledWith("c1", "u-me", READ_MENTION_KEEP_DAYS);
    expect(mentions.map((x) => [x.id, x.unread, x.quoteNumber, x.authorName])).toEqual([
      ["a", true, `${ROOT}-R1`, "Eva Novak"],
      ["b", false, ROOT, "Eva Novak"],
    ]);
  });
});
