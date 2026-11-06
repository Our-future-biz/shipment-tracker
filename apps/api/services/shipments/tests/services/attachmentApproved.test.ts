import { beforeEach, describe, expect, it, vi } from "vitest";

// A document customs has approved stays as it is for a regular user: no re-typing it and no
// undoing or re-stamping its approval. A manager may. Run against a stand-in repository.
const repo = vi.hoisted(() => ({ getForShipment: vi.fn(), updateReview: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: repo }));
vi.mock("../../storage/attachmentBucket", () => ({ attachmentBucket: {} }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../lib/contentToken", () => ({ attachmentContentUrl: () => "/file", companyOfContentToken: () => null }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: {} }));

import { attachmentService } from "../../services/attachment.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const DOC = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const row = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  shipmentId: SHIPMENT,
  companyId: "c1",
  fileName: "invoice.pdf",
  fileSize: 1,
  fileType: "application/pdf",
  storageKey: "k",
  uploadedById: null,
  commentId: null,
  documentType: "Invoice",
  customsStatus: "approved",
  customsNote: "",
  customsReviewedAt: new Date("2026-11-06T10:00:00Z"),
  customsReviewedById: "customs",
  sourceRef: "",
  createdAt: new Date("2026-11-06T09:00:00Z"),
  updatedAt: new Date("2026-11-06T10:00:00Z"),
  deletedAt: null,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  repo.getForShipment.mockResolvedValue(row());
  repo.updateReview.mockImplementation(async (_id, _s, _c, data) => row(data));
});

describe("re-typing a document", () => {
  it("is refused to a regular user once it is approved, in the same write", async () => {
    repo.updateReview.mockResolvedValueOnce(null);
    await expect(attachmentService.classify(SHIPMENT, DOC, "c1", "Packing list", "user")).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.updateReview).toHaveBeenCalledWith(DOC, SHIPMENT, "c1", { documentType: "Packing list" }, { unlessApproved: true });
  });

  it("is a manager's to do, and a missing document is not found", async () => {
    await expect(attachmentService.classify(SHIPMENT, DOC, "c1", "Packing list", "manager")).resolves.toMatchObject({ documentType: "Packing list" });
    expect(repo.updateReview).toHaveBeenCalledWith(DOC, SHIPMENT, "c1", { documentType: "Packing list" }, { unlessApproved: false });
    repo.updateReview.mockResolvedValueOnce(null);
    repo.getForShipment.mockResolvedValueOnce(null);
    await expect(attachmentService.classify(SHIPMENT, DOC, "c1", "Other", "user")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("customs' review of an approved document", () => {
  it("can't be taken back by a regular user", async () => {
    await expect(attachmentService.review(SHIPMENT, DOC, "c1", "", "", "u", "user")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(attachmentService.review(SHIPMENT, DOC, "c1", "declined", "No", "u", "user")).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.updateReview).not.toHaveBeenCalled();
  });

  it("isn't stamped again by a regular user's second approval", async () => {
    const item = await attachmentService.review(SHIPMENT, DOC, "c1", "approved", "", "u", "user");
    expect(item.customsStatus).toBe("approved");
    expect(repo.updateReview).not.toHaveBeenCalled();
  });

  it("is refused when it was approved between the read and the write", async () => {
    repo.getForShipment.mockResolvedValueOnce(row({ customsStatus: "" }));
    repo.updateReview.mockResolvedValueOnce(null);
    await expect(attachmentService.review(SHIPMENT, DOC, "c1", "declined", "Blurred", "u", "user")).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("is a manager's to change", async () => {
    await expect(attachmentService.review(SHIPMENT, DOC, "c1", "", "", "m", "manager")).resolves.toMatchObject({ customsStatus: "" });
    expect(repo.updateReview).toHaveBeenCalledWith(DOC, SHIPMENT, "c1", expect.objectContaining({ customsStatus: "" }), { unlessApproved: false });
  });
});
