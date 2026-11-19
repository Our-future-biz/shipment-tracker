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
const shipments = vi.hoisted(() => ({ findByMasterJobId: vi.fn() }));
const attachments = vi.hoisted(() => ({ listByShipmentIdsOfTypes: vi.fn() }));
const attachmentBucket = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../repositories/masterJobDocument.repository", () => ({ masterJobDocumentRepository: repo }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: masterJobs }));
vi.mock("../../storage/masterJobDocumentBucket", () => ({ masterJobDocumentBucket: bucket }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: attachments }));
vi.mock("../../storage/attachmentBucket", () => ({ attachmentBucket }));
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

describe("downloading the linked shipments' documents in one ZIP", () => {
  const S1 = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c11";
  const S2 = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c12";
  const S3 = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c13";
  const bl = (id: string, shipmentId: string, fileName: string, storageKey: string | null = `${shipmentId}/${id}`, fileSize = 1_000) => ({ id, shipmentId, fileName, storageKey, fileSize });
  const MB = 1024 * 1024;

  beforeEach(() => {
    masterJobs.getByIdForCompany.mockResolvedValue({ id: MJ, mczNumber: "MCZFULL00000006" });
    // Out of job-number order, as the database may give them.
    shipments.findByMasterJobId.mockResolvedValue([
      { id: S2, jobNumber: "CZFCL00000061" },
      { id: S1, jobNumber: "CZFCL00000060" },
      { id: S3, jobNumber: "CZFCL00000062" },
    ]);
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([bl("a2", S2, "HBL.pdf"), bl("a1", S1, "HBL.pdf")]);
    attachmentBucket.download.mockImplementation(async (key: string) => Buffer.from(`%PDF ${key}`));
  });

  it("puts every linked shipment's Bill of Lading in one ZIP, by job number, and names the shipments without one", async () => {
    const res = await masterJobDocumentService.houseBols(MJ, "c1");
    expect(shipments.findByMasterJobId).toHaveBeenCalledWith(MJ, "c1");
    expect(attachments.listByShipmentIdsOfTypes).toHaveBeenCalledWith([S1, S2, S3], "c1", ["Bill of Lading"]);
    expect(res).toMatchObject({ fileCount: 2, withoutFiles: ["CZFCL00000062"], unreadable: [] });
    expect(res.file).toMatchObject({ fileName: "MCZFULL00000006 House BLs.zip", contentType: "application/zip" });
    const { unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(Buffer.from(res.file!.fileBase64, "base64")));
    expect(Object.keys(files)).toEqual(["CZFCL00000060 - HBL.pdf", "CZFCL00000061 - HBL.pdf"]);
    expect(Buffer.from(files["CZFCL00000060 - HBL.pdf"]!).toString()).toBe(`%PDF ${S1}/a1`);
  });

  it("leaves out a file gone from storage and says which, and gives no ZIP when nothing is left", async () => {
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([bl("a1", S1, "HBL.pdf"), bl("a2", S2, "old.pdf", null)]);
    attachmentBucket.download.mockRejectedValueOnce(new Error("missing"));
    const res = await masterJobDocumentService.houseBols(MJ, "c1");
    expect(res).toEqual({ file: null, fileCount: 0, withoutFiles: ["CZFCL00000062"], unreadable: ["CZFCL00000060 - HBL.pdf", "CZFCL00000061 - old.pdf"], leftOut: [] });
  });

  it("gives the commercial paperwork (Commercial Invoices and packing lists) in a folder per shipment", async () => {
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([bl("a3", S2, "Invoice 77.pdf"), bl("a1", S1, "Invoice 12.pdf"), bl("a2", S1, "PL.xlsx")]);
    const res = await masterJobDocumentService.commercialPaperwork(MJ, "c1");
    expect(attachments.listByShipmentIdsOfTypes).toHaveBeenCalledWith([S1, S2, S3], "c1", ["Invoice", "Packing list"]);
    expect(res).toMatchObject({ fileCount: 3, withoutFiles: ["CZFCL00000062"], unreadable: [] });
    expect(res.file!.fileName).toBe("MCZFULL00000006 Commercial paperwork.zip");
    const { unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(Buffer.from(res.file!.fileBase64, "base64")));
    expect(Object.keys(files)).toEqual(["CZFCL00000060/Invoice 12.pdf", "CZFCL00000060/PL.xlsx", "CZFCL00000061/Invoice 77.pdf"]);
  });

  it("leaves out a cancelled shipment and the commercial paperwork customs declined, naming them", async () => {
    shipments.findByMasterJobId.mockResolvedValue([
      { id: S2, jobNumber: "CZFCL00000061" },
      { id: S1, jobNumber: "CZFCL00000060" },
      { id: S3, jobNumber: "CZFCL00000062", status: "Cancelled Shipment" },
    ]);
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([
      { ...bl("a1", S1, "Invoice 12.pdf"), customsStatus: "approved" },
      { ...bl("a2", S1, "Invoice 12 old.pdf"), customsStatus: "declined" },
      { ...bl("a3", S2, "PL.xlsx"), customsStatus: "declined" },
    ]);
    const res = await masterJobDocumentService.commercialPaperwork(MJ, "c1");
    // The cancelled house's files are not even read.
    expect(attachments.listByShipmentIdsOfTypes).toHaveBeenCalledWith([S1, S2], "c1", ["Invoice", "Packing list"]);
    expect(res).toMatchObject({
      fileCount: 1,
      withoutFiles: ["CZFCL00000061"],
      leftOut: ["CZFCL00000062 (cancelled)", "CZFCL00000060 - Invoice 12 old.pdf (declined by customs)", "CZFCL00000061 - PL.xlsx (declined by customs)"],
    });
    expect(attachmentBucket.download).toHaveBeenCalledTimes(1);
  });

  it("keeps a Bill of Lading customs declined: only the commercial paperwork is left out for that", async () => {
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([{ ...bl("a1", S1, "HBL.pdf"), customsStatus: "declined" }]);
    const res = await masterJobDocumentService.houseBols(MJ, "c1");
    expect(res).toMatchObject({ fileCount: 1, leftOut: [] });
  });

  it("names the download by the master job's mode: House AWBs by air (filed as Bills of Lading), CMRs by road", async () => {
    masterJobs.getByIdForCompany.mockResolvedValue({ id: MJ, mczNumber: "MCZ00000007", freightMode: "Air Freight" });
    const air = await masterJobDocumentService.houseBols(MJ, "c1");
    expect(attachments.listByShipmentIdsOfTypes).toHaveBeenLastCalledWith([S1, S2, S3], "c1", ["Bill of Lading"]);
    expect(air.file!.fileName).toBe("MCZ00000007 House AWBs.zip");
    masterJobs.getByIdForCompany.mockResolvedValue({ id: MJ, mczNumber: "MCZ00000008", freightMode: "Road Freight" });
    const road = await masterJobDocumentService.houseBols(MJ, "c1");
    expect(attachments.listByShipmentIdsOfTypes).toHaveBeenLastCalledWith([S1, S2, S3], "c1", ["CMR / POD"]);
    expect(road.file!.fileName).toBe("MCZ00000008 CMRs.zip");
  });

  it("goes by its houses' mode with none of its own - a cancelled house of another mode goes nowhere, so it never decides", async () => {
    masterJobs.getByIdForCompany.mockResolvedValue({ id: MJ, mczNumber: "MCZ00000009", freightMode: "" });
    shipments.findByMasterJobId.mockResolvedValue([
      { id: S1, jobNumber: "CZ00000060", freightMode: "Road Freight" },
      { id: S2, jobNumber: "CZ00000061", freightMode: "Road Freight" },
      { id: S3, jobNumber: "CZ00000062", freightMode: "Sea Freight", status: "Cancelled Shipment" },
    ]);
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([bl("a1", S1, "CMR.pdf"), bl("a2", S2, "CMR.pdf")]);
    const res = await masterJobDocumentService.houseBols(MJ, "c1");
    expect(attachments.listByShipmentIdsOfTypes).toHaveBeenLastCalledWith([S1, S2], "c1", ["CMR / POD"]);
    expect(res).toMatchObject({ fileCount: 2, withoutFiles: [], leftOut: ["CZ00000062 (cancelled)"] });
    expect(res.file!.fileName).toBe("MCZ00000009 CMRs.zip");
  });

  it("is refused before anything is downloaded when the stored files come to more than 100 MB", async () => {
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([bl("a1", S1, "Invoice.pdf", undefined, 60 * MB), bl("a2", S2, "Scan.pdf", undefined, 50 * MB)]);
    await expect(masterJobDocumentService.commercialPaperwork(MJ, "c1")).rejects.toMatchObject({
      code: "failed_precondition",
      message: "These documents come to 110 MB, more than 100 MB in one download: download the files from each shipment's Documents tab",
    });
    expect(attachmentBucket.download).not.toHaveBeenCalled();
  });

  it("stops downloading once files stored without a size pass 100 MB", async () => {
    attachments.listByShipmentIdsOfTypes.mockResolvedValue([bl("a1", S1, "A.pdf", undefined, 0), bl("a2", S1, "B.pdf", undefined, 0), bl("a3", S2, "C.pdf", undefined, 0)]);
    // Only the size of what comes down is read before the ZIP is made.
    attachmentBucket.download.mockImplementation(async () => ({ length: 60 * MB }));
    await expect(masterJobDocumentService.commercialPaperwork(MJ, "c1")).rejects.toMatchObject({
      code: "failed_precondition",
      message: "These documents come to more than 100 MB in one download: download the files from each shipment's Documents tab",
    });
    expect(attachmentBucket.download).toHaveBeenCalledTimes(2);
  });

  it("is refused for a master job of another company, and for an id that is none", async () => {
    masterJobs.getByIdForCompany.mockResolvedValueOnce(null);
    await expect(masterJobDocumentService.houseBols(MJ, "c2")).rejects.toMatchObject({ code: "not_found" });
    masterJobs.getByIdForCompany.mockResolvedValueOnce(null);
    await expect(masterJobDocumentService.commercialPaperwork(MJ, "c2")).rejects.toMatchObject({ code: "not_found" });
    await expect(masterJobDocumentService.houseBols("MCZ00000045", "c1")).rejects.toMatchObject({ code: "not_found" });
    expect(shipments.findByMasterJobId).not.toHaveBeenCalled();
  });
});
