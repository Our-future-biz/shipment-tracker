import { beforeEach, describe, expect, it, vi } from "vitest";

// A shipment's documents: stored with their file and its real size, removed record first, and left
// alone once the shipment is deleted. Run against stand-ins for the repository, the bucket and the
// shipments service.
const repo = vi.hoisted(() => ({ getForShipment: vi.fn(), updateReview: vi.fn(), createForCompany: vi.fn(), softDeleteForCompany: vi.fn() }));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), download: vi.fn() }));
const shipments = vi.hoisted(() => ({ requireLive: vi.fn(), isLive: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: repo }));
vi.mock("../../storage/attachmentBucket", () => ({ attachmentBucket: bucket }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../lib/contentToken", () => ({ attachmentContentUrl: () => "/file", companyOfContentToken: () => "c1" }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: shipments }));

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { attachmentService } from "../../services/attachment.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const DOC = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
// "ABCD" as base64: four bytes.
const FILE = { fileName: "invoice.pdf", fileType: "application/pdf", contentBase64: "QUJDRA==", documentType: "Invoice" };
const row = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  shipmentId: SHIPMENT,
  companyId: "c1",
  fileName: "invoice.pdf",
  fileSize: 4,
  fileType: "application/pdf",
  storageKey: "k",
  uploadedById: null,
  commentId: null,
  documentType: "Invoice",
  customsStatus: "",
  customsNote: "",
  customsReviewedAt: null,
  customsReviewedById: null,
  sourceRef: "",
  createdAt: new Date("2026-11-06T09:00:00Z"),
  updatedAt: new Date("2026-11-06T09:00:00Z"),
  deletedAt: null,
  ...over,
});
const gone = () => APIError.notFound("Shipment not found");

beforeEach(() => {
  vi.resetAllMocks();
  shipments.isLive.mockResolvedValue(true);
  repo.getForShipment.mockResolvedValue(row());
  repo.createForCompany.mockImplementation(async (_companyId, values) => row(values));
  repo.updateReview.mockImplementation(async (_id, _s, _c, data) => row(data));
  bucket.upload.mockResolvedValue(undefined);
  bucket.remove.mockResolvedValue(undefined);
  bucket.download.mockResolvedValue(Buffer.from("ABCD"));
});

describe("adding a document", () => {
  it("stores the file and records the size of what was stored, not what the browser said", async () => {
    await attachmentService.create(SHIPMENT, "c1", { ...FILE, fileSize: 999_999 } as never, "u1");
    expect(bucket.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${SHIPMENT}/`)), Buffer.from("ABCD"), { contentType: "application/pdf" });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", expect.objectContaining({ fileSize: 4, storageKey: bucket.upload.mock.calls[0]![0] }));
  });

  it("refuses a document without its file, before anything is stored", async () => {
    for (const contentBase64 of ["", "===="]) {
      await expect(attachmentService.create(SHIPMENT, "c1", { ...FILE, contentBase64 }, "u1")).rejects.toMatchObject({ code: "invalid_argument", message: "The file is empty" });
    }
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(repo.createForCompany).not.toHaveBeenCalled();
  });

  it("takes the stored bytes away again when the record can't be written, and fails as it did", async () => {
    const failure = new Error("insert failed");
    repo.createForCompany.mockRejectedValueOnce(failure);
    await expect(attachmentService.create(SHIPMENT, "c1", FILE, "u1")).rejects.toBe(failure);
    expect(bucket.remove).toHaveBeenCalledWith(bucket.upload.mock.calls[0]![0]);
    // A removal that fails too is only logged: the caller still hears why the save failed.
    repo.createForCompany.mockRejectedValueOnce(failure);
    bucket.remove.mockRejectedValueOnce(new Error("bucket away"));
    await expect(attachmentService.create(SHIPMENT, "c1", FILE, "u1")).rejects.toBe(failure);
  });
});

describe("deleting a document", () => {
  it("removes the record first, then the stored file", async () => {
    await attachmentService.delete(SHIPMENT, DOC, "c1");
    expect(repo.softDeleteForCompany).toHaveBeenCalledWith(DOC, "c1");
    expect(bucket.remove).toHaveBeenCalledWith("k");
    expect(repo.softDeleteForCompany.mock.invocationCallOrder[0]).toBeLessThan(bucket.remove.mock.invocationCallOrder[0]!);
  });

  it("is done when the stored file can't be removed, and keeps the file when the record can't be", async () => {
    bucket.remove.mockRejectedValueOnce(new Error("already gone"));
    await expect(attachmentService.delete(SHIPMENT, DOC, "c1")).resolves.toBeUndefined();
    repo.softDeleteForCompany.mockRejectedValueOnce(new Error("write failed"));
    bucket.remove.mockClear();
    await expect(attachmentService.delete(SHIPMENT, DOC, "c1")).rejects.toThrow("write failed");
    expect(bucket.remove).not.toHaveBeenCalled();
  });
});

describe("a deleted shipment's documents", () => {
  it("are not re-typed, reviewed or deleted", async () => {
    shipments.requireLive.mockRejectedValue(gone());
    await expect(attachmentService.classify(SHIPMENT, DOC, "c1", "Packing list", "manager")).rejects.toMatchObject({ code: "not_found" });
    await expect(attachmentService.review(SHIPMENT, DOC, "c1", "approved", "", "u1", "manager")).rejects.toMatchObject({ code: "not_found" });
    await expect(attachmentService.delete(SHIPMENT, DOC, "c1")).rejects.toMatchObject({ code: "not_found" });
    expect(shipments.requireLive).toHaveBeenCalledWith(SHIPMENT, "c1");
    expect(repo.updateReview).not.toHaveBeenCalled();
    expect(repo.softDeleteForCompany).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("are no longer handed out by their link, which still opens a live shipment's", async () => {
    await expect(attachmentService.getContent(SHIPMENT, DOC, "t")).resolves.toMatchObject({ fileName: "invoice.pdf" });
    expect(shipments.isLive).toHaveBeenCalledWith(SHIPMENT, "c1");
    shipments.isLive.mockResolvedValue(false);
    bucket.download.mockClear();
    await expect(attachmentService.getContent(SHIPMENT, DOC, "t")).resolves.toBeNull();
    expect(bucket.download).not.toHaveBeenCalled();
  });
});
