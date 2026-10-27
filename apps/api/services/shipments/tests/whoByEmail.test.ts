import { beforeEach, describe, expect, it, vi } from "vitest";

// Who wrote a chat message, uploaded a document or reviewed it for customs is shown by e-mail, as
// every person is (owner decision, 26 Oct 2026). The services run for real against stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../repositories/shipmentAttachment.repository", () => ({
  shipmentAttachmentRepository: { listByShipmentId: vi.fn(), listChatFilesByShipmentId: vi.fn(async () => []) },
}));
vi.mock("../repositories/shipmentComment.repository", () => ({
  shipmentCommentRepository: { listByShipmentId: vi.fn(), lastReadByOthers: vi.fn(async () => null) },
}));
vi.mock("../storage/attachmentBucket", () => ({ attachmentBucket: {} }));
vi.mock("../lib/contentToken", () => ({ attachmentContentUrl: vi.fn(() => "url"), companyOfContentToken: vi.fn() }));
vi.mock("../services/shipment.service", () => ({ shipmentService: { requireLive: vi.fn() } }));

import { auth } from "~encore/clients";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { attachmentService } from "../services/attachment.service";
import { commentService } from "../services/comment.service";
import { userEmails } from "../lib/userEmails";

const JAN = { id: "u-jan", email: "Jan@Firma.cz", displayName: "Jan Novák" };
const EVA = { id: "u-eva", email: "eva@firma.cz", displayName: "Eva Malá" };
const AT = new Date("2026-10-26T08:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.usersList).mockResolvedValue({ users: [JAN, EVA] } as never);
});

describe("userEmails", () => {
  it("maps each user of the company to their lower-cased e-mail", async () => {
    await expect(userEmails()).resolves.toEqual(new Map([["u-jan", "jan@firma.cz"], ["u-eva", "eva@firma.cz"]]));
  });

  it("gives an empty map when the users can't be read, so the list still loads", async () => {
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    await expect(userEmails()).resolves.toEqual(new Map());
  });
});

describe("documents", () => {
  it("name the uploader and the customs reviewer by e-mail", async () => {
    const row = { id: "a1", shipmentId: "s1", companyId: "c1", fileName: "inv.pdf", fileSize: 1, fileType: "application/pdf", createdAt: AT, documentType: "", customsStatus: "approved", customsNote: "", customsReviewedAt: AT };
    vi.mocked(shipmentAttachmentRepository.listByShipmentId).mockResolvedValue([
      { ...row, uploadedById: "u-jan", customsReviewedById: "u-eva" },
      { ...row, id: "a2", uploadedById: "u-gone", customsReviewedById: null },
    ] as never);
    const items = await attachmentService.list("s1", "c1");
    expect(items.map((i) => [i.uploadedByName, i.customsReviewedByName])).toEqual([
      ["jan@firma.cz", "eva@firma.cz"],
      ["Unknown", ""],
    ]);
  });
});

describe("chat messages", () => {
  it("name their author by e-mail", async () => {
    vi.mocked(shipmentCommentRepository.listByShipmentId).mockResolvedValue([
      { id: "m1", shipmentId: "s1", companyId: "c1", authorId: "u-jan", message: "hi", createdAt: AT },
      { id: "m2", shipmentId: "s1", companyId: "c1", authorId: "u-gone", message: "hello", createdAt: AT },
    ] as never);
    const items = await commentService.list("s1", "c1", "u-eva");
    expect(items.map((i) => i.authorName)).toEqual(["jan@firma.cz", ""]);
  });
});
