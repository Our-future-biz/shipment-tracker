import { beforeEach, describe, expect, it, vi } from "vitest";

const comments = vi.hoisted(() => ({ deleteOwn: vi.fn() }));
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

beforeEach(() => {
  vi.clearAllMocks();
  comments.deleteOwn.mockResolvedValue(true);
  files.listIdsByCommentId.mockResolvedValue(["f1"]);
});

describe("deleting a chat message with a file", () => {
  it("keeps the file for a regular user: only a manager deletes a document", async () => {
    await commentService.delete("s1", "m1", "c1", "u1", "user");
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
    comments.deleteOwn.mockResolvedValue(false);
    await expect(commentService.delete("s1", "m1", "c1", "u1", "user")).rejects.toThrow("Message not found");
    expect(files.unlinkFromComment).not.toHaveBeenCalled();
  });
});
