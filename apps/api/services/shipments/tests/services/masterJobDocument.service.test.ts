import { beforeEach, describe, expect, it, vi } from "vitest";

// A master job's documents are a store of their own: their own table and bucket, their own link
// tokens, the master job's company only. Anyone adds one, only a manager deletes one. Run against
// stand-ins for the repositories, the bucket and the tokens.
const repo = vi.hoisted(() => ({
  listByMasterJobId: vi.fn(),
  getForMasterJob: vi.fn(),
  createForCompany: vi.fn(),
  softDeleteForCompany: vi.fn(),
}));
const masterJobs = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
const tokens = vi.hoisted(() => ({ companyOfMasterJobDocumentToken: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../repositories/masterJobDocument.repository", () => ({ masterJobDocumentRepository: repo }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: masterJobs }));
vi.mock("../../storage/masterJobDocumentBucket", () => ({ masterJobDocumentBucket: bucket }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map([["u1", "marek@ourfuture.biz"]]) }));
vi.mock("../../lib/contentToken", () => ({
  masterJobDocumentContentUrl: (mj: string, id: string, company: string) => `/master-jobs/${mj}/documents/${id}/content?t=${company}`,
  companyOfMasterJobDocumentToken: tokens.companyOfMasterJobDocumentToken,
}));

import { masterJobDocumentService } from "../../services/masterJobDocument.service";

const MJ = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const DOC = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const row = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  masterJobId: MJ,
  companyId: "c1",
  fileName: "MBL.pdf",
  fileSize: 3,
  fileType: "application/pdf",
  storageKey: `${MJ}/k`,
  documentType: "Bill of Lading",
  uploadedById: "u1",
  createdAt: new Date("2026-11-09T09:00:00Z"),
  updatedAt: new Date("2026-11-09T09:00:00Z"),
  deletedAt: null,
  ...over,
});
const PDF = Buffer.from("%PDF").toString("base64");

beforeEach(() => {
  vi.resetAllMocks();
  masterJobs.getByIdForCompany.mockResolvedValue({ id: MJ });
  repo.listByMasterJobId.mockResolvedValue([row(), row({ id: "other", uploadedById: null })]);
  repo.getForMasterJob.mockResolvedValue(row());
  repo.createForCompany.mockImplementation(async (_c: string, data: Record<string, unknown>) => row(data));
  repo.softDeleteForCompany.mockResolvedValue(row());
  bucket.upload.mockResolvedValue(undefined);
  bucket.remove.mockResolvedValue(undefined);
  bucket.download.mockResolvedValue(Buffer.from("%PDF"));
  tokens.companyOfMasterJobDocumentToken.mockReturnValue("c1");
});

describe("listing a master job's documents", () => {
  it("shows them with the uploader's e-mail and a link of their own", async () => {
    const items = await masterJobDocumentService.list(MJ, "c1");
    expect(repo.listByMasterJobId).toHaveBeenCalledWith(MJ, "c1");
    expect(items[0]).toEqual({
      id: DOC,
      masterJobId: MJ,
      fileName: "MBL.pdf",
      fileSize: 3,
      fileType: "application/pdf",
      contentUrl: `/master-jobs/${MJ}/documents/${DOC}/content?t=c1`,
      createdAt: "2026-11-09T09:00:00.000Z",
      documentType: "Bill of Lading",
      uploadedByName: "marek@ourfuture.biz",
    });
    expect(items[1]!.uploadedByName).toBe("Unknown");
  });

  it("is refused for a master job of another company, and for an id that is none, before SQL", async () => {
    masterJobs.getByIdForCompany.mockResolvedValueOnce(null);
    await expect(masterJobDocumentService.list(MJ, "c2")).rejects.toMatchObject({ code: "not_found" });
    await expect(masterJobDocumentService.list("MCZ00000045", "c1")).rejects.toMatchObject({ code: "not_found" });
    expect(masterJobs.getByIdForCompany).toHaveBeenCalledTimes(1);
    expect(repo.listByMasterJobId).not.toHaveBeenCalled();
  });
});

describe("adding a document", () => {
  it("stores the bytes in the master job's own bucket, with the stored size and the chosen type", async () => {
    const item = await masterJobDocumentService.create(
      MJ,
      "c1",
      { fileName: "MBL.pdf", fileType: "application/pdf", contentBase64: PDF, documentType: " Bill of Lading " },
      "u1",
    );
    const [key, bytes, options] = bucket.upload.mock.calls[0]!;
    expect(key).toMatch(new RegExp(`^${MJ}/[0-9a-f-]{36}$`));
    expect(Buffer.from(bytes as Buffer).toString()).toBe("%PDF");
    expect(options).toEqual({ contentType: "application/pdf" });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", {
      masterJobId: MJ,
      fileName: "MBL.pdf",
      fileSize: 4,
      fileType: "application/pdf",
      storageKey: key,
      documentType: "Bill of Lading",
      uploadedById: "u1",
    });
    expect(item).toMatchObject({ documentType: "Bill of Lading", uploadedByName: "marek@ourfuture.biz" });
  });

  it("needs a file with bytes and a type, and a master job of the company", async () => {
    const file = { fileName: "x.pdf", fileType: "", contentBase64: PDF, documentType: "Other" };
    await expect(masterJobDocumentService.create(MJ, "c1", { ...file, contentBase64: "" }, "u1")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(masterJobDocumentService.create(MJ, "c1", { ...file, documentType: "  " }, "u1")).rejects.toMatchObject({ code: "invalid_argument" });
    masterJobs.getByIdForCompany.mockResolvedValueOnce(null);
    await expect(masterJobDocumentService.create(MJ, "c2", file, "u1")).rejects.toMatchObject({ code: "not_found" });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("takes the stored bytes away again when the record can't be written", async () => {
    repo.createForCompany.mockRejectedValueOnce(new Error("db down"));
    await expect(
      masterJobDocumentService.create(MJ, "c1", { fileName: "x.pdf", fileType: "", contentBase64: PDF, documentType: "Other" }, "u1"),
    ).rejects.toThrow("db down");
    expect(bucket.upload.mock.calls[0]![2]).toEqual({ contentType: "application/octet-stream" });
    expect(bucket.remove).toHaveBeenCalledWith(bucket.upload.mock.calls[0]![0]);
  });
});

describe("opening a document's file", () => {
  it("serves the bytes for a valid token of this document, from the token's company", async () => {
    await expect(masterJobDocumentService.getContent(MJ, DOC, "t")).resolves.toEqual({
      fileName: "MBL.pdf",
      fileType: "application/pdf",
      buffer: Buffer.from("%PDF"),
    });
    expect(tokens.companyOfMasterJobDocumentToken).toHaveBeenCalledWith("t", DOC);
    expect(repo.getForMasterJob).toHaveBeenCalledWith(DOC, MJ, "c1");
  });

  it("serves nothing without a valid token, for another master job, or when the file is gone", async () => {
    tokens.companyOfMasterJobDocumentToken.mockReturnValueOnce(null);
    await expect(masterJobDocumentService.getContent(MJ, DOC, "forged")).resolves.toBeNull();
    await expect(masterJobDocumentService.getContent("not-an-id", DOC, "t")).resolves.toBeNull();
    repo.getForMasterJob.mockResolvedValueOnce(null);
    await expect(masterJobDocumentService.getContent(MJ, DOC, "t")).resolves.toBeNull();
    bucket.download.mockRejectedValueOnce(new Error("missing"));
    await expect(masterJobDocumentService.getContent(MJ, DOC, "t")).resolves.toBeNull();
  });
});

describe("deleting a document", () => {
  it("is a manager's, an admin's or a superadmin's to do", async () => {
    await expect(masterJobDocumentService.delete(MJ, DOC, "c1", "user")).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.softDeleteForCompany).not.toHaveBeenCalled();
    for (const role of ["manager", "admin", "superadmin"]) await masterJobDocumentService.delete(MJ, DOC, "c1", role);
    expect(repo.softDeleteForCompany).toHaveBeenCalledTimes(3);
  });

  it("removes the record first and then the file, and a file that won't go is only logged", async () => {
    const order: string[] = [];
    repo.softDeleteForCompany.mockImplementationOnce(async () => order.push("record"));
    bucket.remove.mockImplementationOnce(async () => {
      order.push("file");
      throw new Error("gone already");
    });
    await expect(masterJobDocumentService.delete(MJ, DOC, "c1", "manager")).resolves.toBeUndefined();
    expect(order).toEqual(["record", "file"]);
    expect(repo.softDeleteForCompany).toHaveBeenCalledWith(DOC, "c1");
    expect(bucket.remove).toHaveBeenCalledWith(`${MJ}/k`);
  });

  it("finds nothing of another master job or company", async () => {
    repo.getForMasterJob.mockResolvedValueOnce(null);
    await expect(masterJobDocumentService.delete(MJ, DOC, "c2", "manager")).rejects.toMatchObject({ code: "not_found" });
    await expect(masterJobDocumentService.delete(MJ, "nope", "c1", "manager")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.softDeleteForCompany).not.toHaveBeenCalled();
  });
});
