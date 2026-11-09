import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { customerGet: vi.fn(), addressList: vi.fn() } }));
vi.mock("../../../../lib/companyUsers", () => ({ userEmailOf: vi.fn().mockResolvedValue("rep@firm.cz") }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: { getByIdForCompany: vi.fn() } }));
vi.mock("../../repositories/shipmentImportInstruction.repository", () => ({
  shipmentImportInstructionRepository: { latest: vi.fn(), byHash: vi.fn(), replaceOpen: vi.fn(), cancelOpen: vi.fn(), submit: vi.fn(), decide: vi.fn(), reopen: vi.fn(), waitingFor: vi.fn() },
}));
vi.mock("../../services/attachment.service", () => ({ attachmentService: { addFromModule: vi.fn() } }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: { update: vi.fn() } }));
vi.mock("../../lib/importInstructionsPdf", () => ({ importInstructionsPdf: vi.fn().mockResolvedValue(new Uint8Array([1])) }));

import { customers } from "~encore/clients";
import { newLinkToken } from "../../lib/customerLink";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentImportInstructionRepository } from "../../repositories/shipmentImportInstruction.repository";
import { attachmentService } from "../../services/attachment.service";
import { importInstructionsService as service } from "../../services/importInstructions.service";
import { shipmentService } from "../../services/shipment.service";

const repository = vi.mocked(shipmentImportInstructionRepository);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ID = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
const CUSTOMER = "7a2d3c4e-5f60-4a1b-9c2d-3e4f5a6b7c8d";
const CREATOR = "22222222-2222-4222-8222-222222222222";
const creator = { companyID: COMPANY, userID: CREATOR, role: "user" };
const manager = { companyID: COMPANY, userID: "11111111-1111-4111-8111-111111111111", role: "manager" };
const other = { companyID: COMPANY, userID: "33333333-3333-4333-8333-333333333333", role: "user" };
const NOW = new Date("2026-11-09T10:00:00Z");
const { token } = newLinkToken();
const answers = { procedure: "free_circulation", bank: "ČSOB", accountNumber: "1/0300", description: "Parts", tariffCode: "8431", billingAddress: "Praha", name: "Jan", telephone: "+420" } as never;
const row = (over: Record<string, unknown> = {}) =>
  ({ id: "r1", companyId: COMPANY, shipmentId: ID, status: "open", prefill: { description: "Parts" }, answers: null, createdBy: "rep@firm.cz", createdByUserId: CREATOR, createdAt: NOW, expiresAt: new Date("2026-11-20T10:00:00Z"), submittedAt: null, decidedBy: "", decidedAt: null, reason: "", ...over }) as never;
const shipment = (over: Record<string, unknown> = {}) =>
  ({ id: ID, jobNumber: "CZ00000041", tradeDirection: "Import", customerId: CUSTOMER, cargoDescription: "Parts", deliveryAddress: "", customsProcedure: "", customsOffice: "", hsCode: "", ...over }) as never;
const submitted = () => row({ status: "submitted", answers, submittedAt: NOW });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue(shipment());
  repository.latest.mockResolvedValue(null as never);
  repository.byHash.mockResolvedValue(row());
  repository.submit.mockResolvedValue(row({ status: "submitted" }));
  repository.decide.mockResolvedValue(row({ status: "approved" }));
  repository.reopen.mockResolvedValue(undefined);
  vi.mocked(customers.customerGet).mockResolvedValue({ customer: { ico: "12345678", dic: "CZ12345678", registeredAddress: "Seat 1" } } as never);
  vi.mocked(customers.addressList).mockResolvedValue({ data: [{ types: ["Billing"], street: "Bill 2", postalCode: "11000", city: "Praha", country: "CZ" }] } as never);
});

describe("creating a link", () => {
  it("pre-fills what is known, with the billing address and the customer's numbers", async () => {
    const { url } = await service.createLink(ID, creator, NOW);
    expect(url).toMatch(/\/import-instructions\/[\w-]{43}$/);
    expect(repository.replaceOpen).toHaveBeenCalledWith(expect.objectContaining({ prefill: { description: "Parts", deliveryAddress: "", companyId: "12345678", vatId: "CZ12345678", billingAddress: "Bill 2, 11000 Praha, CZ" }, expiresAt: new Date("2026-11-23T10:00:00Z"), createdByUserId: CREATOR }));
  });

  it("still works when the customer can't be read", async () => {
    vi.mocked(customers.customerGet).mockRejectedValue(new Error("down"));
    await service.createLink(ID, creator, NOW);
    expect(repository.replaceOpen).toHaveBeenCalledWith(expect.objectContaining({ prefill: { description: "Parts", deliveryAddress: "" } }));
  });

  it("is only for imports, and not over a form that waits or was approved", async () => {
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValueOnce(shipment({ tradeDirection: "Export" }));
    await expect(service.createLink(ID, creator)).rejects.toMatchObject({ code: "failed_precondition" });
    repository.latest.mockResolvedValueOnce(submitted());
    await expect(service.createLink(ID, creator)).rejects.toMatchObject({ code: "failed_precondition" });
    repository.latest.mockResolvedValueOnce(row({ status: "approved" }));
    await expect(service.createLink(ID, creator)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repository.replaceOpen).not.toHaveBeenCalled();
  });

  it("can follow a rejected form", async () => {
    repository.latest.mockResolvedValueOnce(row({ status: "rejected" }));
    await expect(service.createLink(ID, creator, NOW)).resolves.toBeTruthy();
  });
});

describe("the customer's page", () => {
  it("answers every link that doesn't open alike", async () => {
    await expect(service.publicForm("nonsense")).rejects.toMatchObject({ code: "not_found" });
    for (const over of [{ status: "submitted" }, { status: "cancelled" }, { status: "approved" }, { status: "rejected" }, { expiresAt: NOW }]) {
      repository.byHash.mockResolvedValue(row(over));
      await expect(service.publicForm(token, NOW)).rejects.toMatchObject({ code: "not_found", message: "This link is no longer valid" });
    }
  });

  it("shows the reference and what is known, nothing else", async () => {
    await expect(service.publicForm(token, NOW)).resolves.toEqual({ reference: "CZ00000041", prefill: { description: "Parts" } });
  });

  it("refuses without the box ticked or with the form incomplete", async () => {
    await expect(service.submit(token, { confirmed: false, answers }, NOW)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.submit(token, { confirmed: true, answers: { procedure: "t1" } }, NOW)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("refuses a customs office that is not on the list", async () => {
    await expect(service.submit(token, { confirmed: true, answers: { ...(answers as object), procedure: "t1", t1Office: "Somewhere" } as never }, NOW)).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringMatching(/from the list/) });
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("takes a complete form once", async () => {
    await service.submit(token, { confirmed: true, answers }, NOW);
    expect(repository.submit).toHaveBeenCalledOnce();
    repository.submit.mockResolvedValue(null as never);
    await expect(service.submit(token, { confirmed: true, answers }, NOW)).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes nothing to the shipment", async () => {
    await service.submit(token, { confirmed: true, answers }, NOW);
    expect(shipmentService.update).not.toHaveBeenCalled();
  });
});

describe("answering", () => {
  beforeEach(() => repository.latest.mockResolvedValue(submitted()));

  it("is for the one who created the link or a manager", async () => {
    await expect(service.approve(ID, other, answers)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.reject(ID, other, "wrong data")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.approve(ID, creator, answers)).resolves.toBeUndefined();
    await expect(service.approve(ID, manager, answers)).resolves.toBeUndefined();
  });

  it("fills empty fields only and files the PDF", async () => {
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue(shipment({ hsCode: "9999" }));
    await service.approve(ID, creator, answers, NOW);
    expect(shipmentService.update).toHaveBeenCalledWith(ID, COMPANY, { customsProcedure: "JSD" }, CREATOR);
    expect(attachmentService.addFromModule).toHaveBeenCalledWith(ID, COMPANY, expect.objectContaining({ documentType: "Import Instructions", fileType: "application/pdf", fileName: "Import Instructions CZ00000041.pdf" }), CREATOR);
  });

  it("stores the answers as edited, and refuses an edit that leaves them incomplete", async () => {
    await service.approve(ID, creator, { ...(answers as object), tariffCode: "1234" } as never, NOW);
    expect(repository.decide).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "approved", answers: expect.objectContaining({ tariffCode: "1234" }) }), NOW);
    await expect(service.approve(ID, creator, { ...(answers as object), description: "" } as never)).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("goes back to waiting when the shipment can't be written", async () => {
    vi.mocked(shipmentService.update).mockRejectedValueOnce(new Error("locked"));
    await expect(service.approve(ID, creator, answers, NOW)).rejects.toThrow("locked");
    expect(repository.reopen).toHaveBeenCalledWith("r1");
  });

  it("rejects with a reason, and nothing reaches the shipment", async () => {
    await expect(service.reject(ID, creator, " x ")).rejects.toMatchObject({ code: "invalid_argument" });
    repository.decide.mockResolvedValue(row({ status: "rejected" }));
    await service.reject(ID, creator, "Wrong procedure", NOW);
    expect(repository.decide).toHaveBeenCalledWith("r1", { status: "rejected", by: "rep@firm.cz", reason: "Wrong procedure" }, NOW);
    expect(shipmentService.update).not.toHaveBeenCalled();
    expect(attachmentService.addFromModule).not.toHaveBeenCalled();
  });

  it("refuses a second answer", async () => {
    repository.decide.mockResolvedValue(null as never);
    await expect(service.approve(ID, creator, answers)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(shipmentService.update).not.toHaveBeenCalled();
    repository.latest.mockResolvedValue(row({ status: "approved" }));
    await expect(service.reject(ID, creator, "too late")).rejects.toMatchObject({ code: "failed_precondition" });
  });
});
