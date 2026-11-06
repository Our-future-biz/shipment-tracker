import { beforeEach, describe, expect, it, vi } from "vitest";

const comments = vi.hoisted(() => ({ getByIdForCompany: vi.fn(), softDeleteForCompany: vi.fn(), updateForCompany: vi.fn() }));
const files = vi.hoisted(() => ({ listIdsByCommentId: vi.fn(), unlinkFromComment: vi.fn() }));
const attachmentService = vi.hoisted(() => ({ delete: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../../../lib/companyUsers", () => ({ companyUsers: vi.fn(), companyUsersWithRoles: vi.fn() }));
vi.mock("../../lib/userEmails", () => ({ userEmails: vi.fn() }));
vi.mock("../../lib/contentToken", () => ({ attachmentContentUrl: vi.fn() }));
vi.mock("../../repositories/shipmentComment.repository", () => ({ shipmentCommentRepository: comments }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: files }));
vi.mock("../../services/attachment.service", () => ({ attachmentService }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: {} }));

import { commentService } from "../../services/comment.service";

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);
const line = (over: object = {}) => ({ id: "m1", shipmentId: "s1", authorId: "u1", createdAt: secondsAgo(30), struckAt: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  comments.getByIdForCompany.mockResolvedValue(line());
  files.listIdsByCommentId.mockResolvedValue(["f1"]);
});

describe("deleting a chat message with a file", () => {
  it("keeps the file for a regular user: only a manager deletes a document", async () => {
    await commentService.delete("s1", "m1", "c1", "u1", "user");
    expect(comments.softDeleteForCompany).toHaveBeenCalledWith("m1", "c1");
    expect(files.unlinkFromComment).toHaveBeenCalledWith("m1", "c1");
    expect(attachmentService.delete).not.toHaveBeenCalled();
  });

  it("takes the file along for a manager, an admin and a superadmin", async () => {
    for (const role of ["manager", "admin", "superadmin"]) {
      vi.clearAllMocks();
      files.listIdsByCommentId.mockResolvedValue(["f1"]);
      await commentService.delete("s1", "m1", "c1", "u1", role);
      expect(attachmentService.delete).toHaveBeenCalledWith("s1", "f1", "c1");
      expect(files.unlinkFromComment).not.toHaveBeenCalled();
    }
  });

  it("does neither for a message that isn't theirs", async () => {
    comments.getByIdForCompany.mockResolvedValue(line({ authorId: "u2" }));
    await expect(commentService.delete("s1", "m1", "c1", "u1", "user")).rejects.toThrow("Only the person who wrote");
    expect(comments.softDeleteForCompany).not.toHaveBeenCalled();
    expect(files.unlinkFromComment).not.toHaveBeenCalled();
  });
});

describe("the 2 minutes to pull a message back", () => {
  it("lets the writer delete just inside them and refuses after, a manager too", async () => {
    comments.getByIdForCompany.mockResolvedValue(line({ createdAt: secondsAgo(110) }));
    await commentService.delete("s1", "m1", "c1", "u1", "user");
    expect(comments.softDeleteForCompany).toHaveBeenCalledTimes(1);

    comments.getByIdForCompany.mockResolvedValue(line({ createdAt: secondsAgo(130) }));
    for (const role of ["user", "manager"]) {
      await expect(commentService.delete("s1", "m1", "c1", "u1", role)).rejects.toThrow("within 2 minutes");
    }
    expect(comments.softDeleteForCompany).toHaveBeenCalledTimes(1);
  });

  it("lets an admin and a superadmin delete anyone's message at any time", async () => {
    comments.getByIdForCompany.mockResolvedValue(line({ authorId: "u2", createdAt: secondsAgo(86400) }));
    for (const role of ["admin", "superadmin"]) await commentService.delete("s1", "m1", "c1", "u1", role);
    expect(comments.softDeleteForCompany).toHaveBeenCalledTimes(2);
  });

  it("doesn't let a manager delete someone else's message, even a new one", async () => {
    comments.getByIdForCompany.mockResolvedValue(line({ authorId: "u2" }));
    await expect(commentService.delete("s1", "m1", "c1", "u1", "manager")).rejects.toThrow("Only the person who wrote");
  });

  it("doesn't find a message through another shipment", async () => {
    await expect(commentService.delete("s2", "m1", "c1", "u1", "superadmin")).rejects.toThrow("Message not found");
    comments.getByIdForCompany.mockResolvedValue(null);
    await expect(commentService.delete("s1", "m1", "c1", "u1", "superadmin")).rejects.toThrow("Message not found");
  });
});

describe("crossing out a chat message", () => {
  it("is the writer's: the message stays, marked struck", async () => {
    comments.getByIdForCompany.mockResolvedValue(line({ createdAt: secondsAgo(86400) }));
    await commentService.strike("s1", "m1", "c1", "u1");
    expect(comments.updateForCompany).toHaveBeenCalledWith("m1", "c1", { struckAt: expect.any(Date) });
    expect(comments.softDeleteForCompany).not.toHaveBeenCalled();
  });

  it("is refused to anyone else", async () => {
    comments.getByIdForCompany.mockResolvedValue(line({ authorId: "u2" }));
    await expect(commentService.strike("s1", "m1", "c1", "u1")).rejects.toThrow("Only the person who wrote");
    expect(comments.updateForCompany).not.toHaveBeenCalled();
  });

  it("keeps the first time when it is already crossed out", async () => {
    comments.getByIdForCompany.mockResolvedValue(line({ struckAt: secondsAgo(60) }));
    await commentService.strike("s1", "m1", "c1", "u1");
    expect(comments.updateForCompany).not.toHaveBeenCalled();
  });
});
