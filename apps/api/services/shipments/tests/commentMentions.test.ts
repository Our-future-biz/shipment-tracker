import { describe, expect, it, vi } from "vitest";

// The bell's mentions: unread ones, and read ones written in the last 7 days, each saying which it
// is. The service is run for real against a stand-in repository.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../repositories/shipmentComment.repository", () => ({ shipmentCommentRepository: { unreadMentions: vi.fn(), createForCompany: vi.fn() } }));
vi.mock("../repositories/shipmentAttachment.repository", () => ({
  shipmentAttachmentRepository: { linkToComment: vi.fn(), listChatFilesByShipmentId: vi.fn(async () => []) },
}));
// Who wrote a message is shown by e-mail, as every person is.
vi.mock("../lib/userEmails", () => ({ userEmails: vi.fn(async () => new Map([["u-eva", "eva@firma.cz"], ["u-me", "me@firma.cz"]])) }));
vi.mock("../services/attachment.service", () => ({ attachmentService: {} }));
vi.mock("../services/shipment.service", () => ({ shipmentService: { requireLive: vi.fn() } }));
vi.mock("../lib/contentToken", () => ({ attachmentContentUrl: vi.fn() }));

import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { commentService, READ_MENTION_KEEP_DAYS } from "../services/comment.service";

const repo = vi.mocked(shipmentCommentRepository);

describe("the bell's mentions", () => {
  it("asks for read ones of the last 7 days and says which are unread", async () => {
    const at = (s: string) => new Date(s);
    repo.unreadMentions.mockResolvedValue([
      { id: "m1", shipmentId: "s1", jobNumber: "CZ1", authorId: "u-eva", message: "@you new", createdAt: at("2026-10-23T09:00:00Z"), readAt: at("2026-10-23T08:00:00Z") },
      { id: "m2", shipmentId: "s2", jobNumber: "CZ2", authorId: "u-eva", message: "@you old", createdAt: at("2026-10-20T09:00:00Z"), readAt: at("2026-10-21T08:00:00Z") },
      { id: "m3", shipmentId: "s3", jobNumber: null, authorId: "u-gone", message: "@you", createdAt: at("2026-10-22T09:00:00Z"), readAt: null },
    ] as never);
    const mentions = await commentService.unreadMentions("c1", "u-me");
    expect(repo.unreadMentions).toHaveBeenCalledWith("c1", "u-me", READ_MENTION_KEEP_DAYS);
    expect(READ_MENTION_KEEP_DAYS).toBe(7);
    expect(mentions.map((m) => [m.id, m.unread, m.authorName, m.jobNumber])).toEqual([
      ["m1", true, "eva@firma.cz", "CZ1"],
      ["m2", false, "eva@firma.cz", "CZ2"],
      ["m3", true, "", ""],
    ]);
  });
});

describe("a message's tags", () => {
  it("keeps a tag of the writer (a notice posted for their click) and drops anyone who is no colleague", async () => {
    repo.createForCompany.mockImplementation(async (companyId, c) => ({ id: "c1", companyId, createdAt: new Date(), ...c }) as never);
    await commentService.create("s1", "c1", "u-me", { message: "Cargo has been remeasured", attachmentIds: [], mentionedUserIds: ["u-me", "u-eva", "u-eva", "u-stranger"] });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", expect.objectContaining({ authorId: "u-me", mentionedUserIds: ["u-me", "u-eva"] }));
  });
});
