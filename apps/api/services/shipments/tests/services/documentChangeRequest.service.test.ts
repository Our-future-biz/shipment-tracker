import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  isWaiting: vi.fn(),
  listForShipment: vi.fn(),
  listForManagers: vi.fn(),
  answersFor: vi.fn(),
  answer: vi.fn(),
  approveWithSwap: vi.fn(),
  markSeen: vi.fn(),
}));
const NoLongerApproved = vi.hoisted(() => class DocumentNoLongerApproved extends Error {});
const attachments = vi.hoisted(() => ({ getForShipment: vi.fn(), createForCompany: vi.fn(), softDeleteForCompany: vi.fn() }));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), download: vi.fn() }));
const comments = vi.hoisted(() => ({ postDocumentChangeNotice: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn(async () => ({ users: [{ id: "u", name: "Jan Novák" }] })) } }));
vi.mock("../../lib/contentToken", () => ({
  attachmentContentUrl: () => "/old",
  documentChangeContentUrl: () => "/new",
  companyOfDocumentChangeToken: () => "c1",
}));
vi.mock("../../repositories/documentChangeRequest.repository", () => ({ documentChangeRequestRepository: repo, DocumentNoLongerApproved: NoLongerApproved }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: attachments }));
vi.mock("../../storage/attachmentBucket", () => ({ attachmentBucket: bucket }));
vi.mock("../../services/comment.service", () => ({ commentService: comments }));

import { documentChangeRequestService as requests } from "../../services/documentChangeRequest.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const DOC = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const ID = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";
const user = { userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01", companyID: "c1", role: "user" };
const manager = { ...user, userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02", role: "manager" };
const input = { fileName: "new.pdf", fileSize: 10, fileType: "application/pdf", contentBase64: "QUJD", reason: "Wrong invoice" };
const doc = (over = {}) => ({ id: DOC, fileName: "old.pdf", documentType: "Invoice", customsStatus: "approved", ...over });
const request = (over = {}) => ({
  id: ID,
  companyId: "c1",
  shipmentId: SHIPMENT,
  attachmentId: DOC,
  jobNumber: "CZ1",
  customer: "Alza",
  fileName: "old.pdf",
  documentType: "Invoice",
  newFileName: "new.pdf",
  newFileType: "application/pdf",
  newFileSize: 10,
  newStorageKey: "key",
  reason: "Wrong invoice",
  status: "pending",
  requestedById: user.userID,
  requestedByName: "Jan",
  requestedAt: new Date("2026-11-06T10:00:00Z"),
  decidedByName: "",
  decidedAt: null,
  comment: "",
  answerSeenAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  attachments.getForShipment.mockResolvedValue(doc());
  repo.isWaiting.mockResolvedValue(false);
  repo.create.mockImplementation(async (values) => request(values));
  repo.get.mockResolvedValue(request());
  repo.answer.mockImplementation(async (_id, _company, answer) => request(answer));
  repo.approveWithSwap.mockImplementation(async (_id, _company, answer) => request({ ...answer, status: "approved" }));
});

describe("asking to change an approved document", () => {
  it("stores the new file apart and records the request, the document staying as it is", async () => {
    const item = await requests.ask(user, SHIPMENT, DOC, input);
    expect(bucket.upload).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: DOC, fileName: "old.pdf", documentType: "Invoice", newFileName: "new.pdf", reason: "Wrong invoice", requestedById: user.userID, requestedByName: "Jan Novák" }),
    );
    expect(item.newFileUrl).toBe("/new");
    expect(attachments.softDeleteForCompany).not.toHaveBeenCalled();
  });

  it("tells the shipment's chat, and keeps the request when that fails", async () => {
    comments.postDocumentChangeNotice.mockRejectedValueOnce(new Error("chat down"));
    await expect(requests.ask(user, SHIPMENT, DOC, input)).resolves.toMatchObject({ status: "pending" });
    expect(comments.postDocumentChangeNotice).toHaveBeenCalledWith(SHIPMENT, "c1", user.userID, expect.objectContaining({ newFileName: "new.pdf" }));
  });

  it("wants a reason and a file, for an approved document", async () => {
    await expect(requests.ask(user, SHIPMENT, DOC, { ...input, reason: " " })).rejects.toThrow("Say why");
    await expect(requests.ask(user, SHIPMENT, DOC, { ...input, contentBase64: "" })).rejects.toThrow("Attach the new file");
    attachments.getForShipment.mockResolvedValueOnce(doc({ customsStatus: "declined" }));
    await expect(requests.ask(user, SHIPMENT, DOC, input)).rejects.toThrow("Only a document customs has approved");
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("stores nothing while a request waits, and drops the file if one got in first", async () => {
    repo.isWaiting.mockResolvedValueOnce(true);
    await expect(requests.ask(user, SHIPMENT, DOC, input)).rejects.toThrow("already waiting");
    expect(bucket.upload).not.toHaveBeenCalled();
    repo.create.mockResolvedValueOnce(null);
    await expect(requests.ask(user, SHIPMENT, DOC, input)).rejects.toThrow("already waiting");
    expect(bucket.remove).toHaveBeenCalledTimes(1);
    expect(comments.postDocumentChangeNotice).not.toHaveBeenCalled();
  });
});

describe("answering a request", () => {
  it("is for managers only, listing included", async () => {
    await expect(requests.decide(user, ID, { approve: true })).rejects.toThrow("Only a manager");
    await expect(requests.listForManagers(user)).rejects.toThrow("Only a manager");
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("approved, the new file becomes the document, at pending, and the old one leaves the lists with its file kept, in one turn", async () => {
    const item = await requests.decide(manager, ID, { approve: true });
    expect(item.status).toBe("approved");
    expect(repo.approveWithSwap).toHaveBeenCalledWith(
      ID,
      "c1",
      expect.objectContaining({ decidedById: manager.userID, comment: "" }),
      { attachmentId: DOC, shipmentId: SHIPMENT },
      { fileName: "new.pdf", fileSize: 10, fileType: "application/pdf", storageKey: "key", documentType: "Invoice", uploadedById: user.userID },
    );
    expect(repo.answer).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("rejected, needs a reason, drops the new file and leaves the document alone", async () => {
    await expect(requests.decide(manager, ID, { approve: false, comment: " " })).rejects.toThrow("Say why");
    const item = await requests.decide(manager, ID, { approve: false, comment: "It is right" });
    expect(item.status).toBe("rejected");
    expect(bucket.remove).toHaveBeenCalledWith("key");
    expect(repo.approveWithSwap).not.toHaveBeenCalled();
  });

  it("does not approve once the document is no longer the approved one", async () => {
    for (const current of [doc({ customsStatus: "" }), null]) {
      attachments.getForShipment.mockResolvedValueOnce(current);
      await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("has changed since");
    }
    expect(repo.approveWithSwap).not.toHaveBeenCalled();
    // Changed between the read and the swap: the transaction finds it gone and writes nothing.
    repo.approveWithSwap.mockRejectedValueOnce(new NoLongerApproved());
    await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("has changed since");
  });

  it("does not answer twice", async () => {
    repo.get.mockResolvedValueOnce(request({ status: "approved" }));
    await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("already been answered");
    repo.approveWithSwap.mockResolvedValueOnce(null);
    await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("already been answered");
    repo.answer.mockResolvedValueOnce(null);
    await expect(requests.decide(manager, ID, { approve: false, comment: "It is right" })).rejects.toThrow("already been answered");
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("lets a failed swap through as an error, the request still waiting", async () => {
    repo.approveWithSwap.mockRejectedValueOnce(new Error("write failed"));
    await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("write failed");
  });
});

describe("the new file's link", () => {
  it("serves it only while the request waits", async () => {
    bucket.download.mockResolvedValue(Buffer.from("x"));
    await expect(requests.getContent(ID, "t")).resolves.toMatchObject({ fileName: "new.pdf" });
    repo.get.mockResolvedValueOnce(request({ status: "rejected" }));
    await expect(requests.getContent(ID, "t")).resolves.toBeNull();
  });

  it("shows no new file link once answered", async () => {
    await requests.decide(manager, ID, { approve: false, comment: "It is right" }).then((item) => expect(item.newFileUrl).toBeNull());
  });
});
