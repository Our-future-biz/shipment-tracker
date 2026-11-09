import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { customerGet: vi.fn(), addressList: vi.fn() } }));
// Who is who: the link's creator, the shipment's Person in Charge, a manager and a colleague.
const EMAILS = vi.hoisted((): Record<string, string> => ({
  "22222222-2222-4222-8222-222222222222": "rep@firm.cz",
  "44444444-4444-4444-8444-444444444444": "pic@firm.cz",
  "11111111-1111-4111-8111-111111111111": "boss@firm.cz",
  "33333333-3333-4333-8333-333333333333": "other@firm.cz",
}));
vi.mock("../../../../lib/companyUsers", () => ({ userEmailOf: vi.fn(async (id: string) => EMAILS[id] ?? "") }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: { getByIdForCompany: vi.fn() } }));
vi.mock("../../repositories/shipmentImportInstruction.repository", () => ({
  shipmentImportInstructionRepository: { latest: vi.fn(), byHash: vi.fn(), replaceOpen: vi.fn(), cancelOpen: vi.fn(), submit: vi.fn(), decide: vi.fn(), reopen: vi.fn(), waitingFor: vi.fn() },
}));
vi.mock("../../services/attachment.service", () => ({ attachmentService: { addFromModule: vi.fn() } }));
// The shipment edit rule as the shipment service applies it (lib/shipmentEditRule).
vi.mock("../../services/shipment.service", async () => {
  const rule = await import("../../lib/shipmentEditRule");
  return {
    shipmentService: {
      update: vi.fn(),
      requireDetailsEditor: vi.fn(),
      mayChangeDetails: vi.fn(async (s: { personInCharge: string; holidayCover: string }, userId: string, role: string) => rule.isDetailsManager(role) || rule.isOpenToPerson(s, "") || rule.isOpenToPerson(s, EMAILS[userId] ?? "")),
    },
  };
});
vi.mock("../../lib/importInstructionsPdf", () => ({ importInstructionsPdf: vi.fn().mockResolvedValue(new Uint8Array([1])) }));

import { customers } from "~encore/clients";
import { importInstructionsPdf } from "../../lib/importInstructionsPdf";
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
const PIC = "44444444-4444-4444-8444-444444444444";
const creator = { companyID: COMPANY, userID: CREATOR, role: "user" };
const pic = { companyID: COMPANY, userID: PIC, role: "user" };
const manager = { companyID: COMPANY, userID: "11111111-1111-4111-8111-111111111111", role: "manager" };
const other = { companyID: COMPANY, userID: "33333333-3333-4333-8333-333333333333", role: "user" };
const NOW = new Date("2026-11-09T10:00:00Z");
const { token } = newLinkToken();
const answers = { procedure: "free_circulation", bank: "ČSOB", accountNumber: "1/0300", description: "Parts", tariffCode: "8431", billingAddress: "Praha", name: "Jan", telephone: "+420" } as never;
const row = (over: Record<string, unknown> = {}) =>
  ({ id: "r1", companyId: COMPANY, shipmentId: ID, status: "open", prefill: { description: "Parts" }, answers: null, approvedAnswers: null, createdBy: "rep@firm.cz", createdByUserId: CREATOR, createdAt: NOW, expiresAt: new Date("2026-11-20T10:00:00Z"), submittedAt: null, decidedBy: "", decidedAt: null, reason: "", ...over }) as never;
// The shipment names its Person in Charge, not the link's creator.
const shipment = (over: Record<string, unknown> = {}) =>
  ({ id: ID, jobNumber: "CZ00000041", tradeDirection: "Import", customerId: CUSTOMER, cargoDescription: "Parts", deliveryAddress: "", customsProcedure: "", customsOffice: "", hsCode: "", personInCharge: "pic@firm.cz — Pia", holidayCover: "", ...over }) as never;
const submitted = () => row({ status: "submitted", answers, submittedAt: NOW });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue(shipment());
  repository.latest.mockResolvedValue(null as never);
  repository.byHash.mockResolvedValue(row());
  repository.replaceOpen.mockResolvedValue(row());
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

  it("is for whoever may change the shipment's details", async () => {
    await service.createLink(ID, pic, NOW);
    expect(shipmentService.requireDetailsEditor).toHaveBeenCalledWith(ID, pic);
    vi.mocked(shipmentService.requireDetailsEditor).mockRejectedValueOnce(Object.assign(new Error("Only this shipment's Person in Charge"), { code: "permission_denied" }));
    await expect(service.createLink(ID, other, NOW)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.replaceOpen).toHaveBeenCalledOnce();
  });

  it("is refused when another live form came meanwhile", async () => {
    repository.replaceOpen.mockResolvedValueOnce(null as never);
    await expect(service.createLink(ID, pic, NOW)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/changed meanwhile/) });
  });
});

describe("cancelling a link", () => {
  it("is for whoever may change the shipment's details", async () => {
    repository.cancelOpen.mockResolvedValue(true);
    await expect(service.cancelLink(ID, creator)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.cancelLink(ID, pic)).resolves.toBeUndefined();
    expect(repository.cancelOpen).toHaveBeenCalledOnce();
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

  it("is refused once the shipment is deleted", async () => {
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue(null as never);
    await expect(service.submit(token, { confirmed: true, answers }, NOW)).rejects.toMatchObject({ code: "not_found", message: "This link is no longer valid" });
    expect(repository.submit).not.toHaveBeenCalled();
  });
});

describe("answering", () => {
  beforeEach(() => repository.latest.mockResolvedValue(submitted()));

  it("follows the shipment edit rule: its Person in Charge, its Holiday Cover or a manager; the creator alone is not enough", async () => {
    await expect(service.approve(ID, creator, answers)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.reject(ID, creator, "wrong data")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.approve(ID, other, answers)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.decide).not.toHaveBeenCalled();
    await expect(service.approve(ID, pic, answers)).resolves.toBeUndefined();
    await expect(service.approve(ID, manager, answers)).resolves.toBeUndefined();
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue(shipment({ personInCharge: "", holidayCover: "rep@firm.cz" }));
    await expect(service.approve(ID, creator, answers)).resolves.toBeUndefined();
  });

  it("is open to anyone, the creator too, on a shipment that names nobody", async () => {
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue(shipment({ personInCharge: "", holidayCover: "" }));
    await expect(service.approve(ID, creator, answers)).resolves.toBeUndefined();
  });

  it("fills empty fields only, as the one answering, and files the PDF", async () => {
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue(shipment({ hsCode: "9999" }));
    await service.approve(ID, pic, answers, NOW);
    expect(shipmentService.update).toHaveBeenCalledWith(ID, COMPANY, { customsProcedure: "JSD" }, PIC, "user");
    expect(attachmentService.addFromModule).toHaveBeenCalledWith(ID, COMPANY, expect.objectContaining({ documentType: "Import Instructions", fileType: "application/pdf", fileName: "Import Instructions CZ00000041.pdf" }), PIC);
  });

  it("reads the shipment again before it writes: a field filled in meanwhile stays", async () => {
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValueOnce(shipment()).mockResolvedValueOnce(shipment({ hsCode: "7777" }));
    await service.approve(ID, pic, answers, NOW);
    expect(shipmentService.update).toHaveBeenCalledWith(ID, COMPANY, { customsProcedure: "JSD" }, PIC, "user");
  });

  it("keeps what the customer sent, stores what was approved beside it, and refuses an edit that leaves it incomplete", async () => {
    await service.approve(ID, pic, { ...(answers as object), tariffCode: "1234" } as never, NOW);
    const [, decision] = repository.decide.mock.calls[0]!;
    expect(decision).toMatchObject({ status: "approved", by: "pic@firm.cz", approvedAnswers: expect.objectContaining({ tariffCode: "1234" }) });
    expect(decision).not.toHaveProperty("answers");
    await expect(service.approve(ID, pic, { ...(answers as object), description: "" } as never)).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("prints what the customer confirmed, and each answer changed before approving with who changed it", async () => {
    await service.approve(ID, pic, { ...(answers as object), tariffCode: "1234" } as never, NOW);
    const [printed, meta] = vi.mocked(importInstructionsPdf).mock.calls[0]!;
    expect(printed).toMatchObject({ tariffCode: "8431", name: "Jan" });
    expect(meta).toMatchObject({ reference: "CZ00000041", approvedBy: "pic@firm.cz", changes: [{ field: "tariffCode", label: "Customs tariff code", sent: "8431", approved: "1234" }] });
  });

  it("goes back to waiting when the shipment can't be written", async () => {
    vi.mocked(shipmentService.update).mockRejectedValueOnce(new Error("locked"));
    await expect(service.approve(ID, pic, answers, NOW)).rejects.toThrow("locked");
    expect(repository.reopen).toHaveBeenCalledWith("r1");
  });

  it("rejects with a reason, and nothing reaches the shipment", async () => {
    await expect(service.reject(ID, pic, " x ")).rejects.toMatchObject({ code: "invalid_argument" });
    repository.decide.mockResolvedValue(row({ status: "rejected" }));
    await service.reject(ID, pic, "Wrong procedure", NOW);
    expect(repository.decide).toHaveBeenCalledWith("r1", { status: "rejected", by: "pic@firm.cz", reason: "Wrong procedure" }, NOW);
    expect(shipmentService.update).not.toHaveBeenCalled();
    expect(attachmentService.addFromModule).not.toHaveBeenCalled();
  });

  it("refuses a second answer", async () => {
    repository.decide.mockResolvedValue(null as never);
    await expect(service.approve(ID, pic, answers)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(shipmentService.update).not.toHaveBeenCalled();
    repository.latest.mockResolvedValue(row({ status: "approved" }));
    await expect(service.reject(ID, pic, "too late")).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("the desk's view", () => {
  it("shows what the customer sent, what was approved and what changed, and who may answer", async () => {
    repository.latest.mockResolvedValue(row({ status: "approved", answers, approvedAnswers: { ...(answers as object), tariffCode: "1234" }, submittedAt: NOW }));
    const { state } = await service.get(ID, pic, NOW);
    expect(state).toMatchObject({
      status: "approved",
      answers: expect.objectContaining({ tariffCode: "8431" }),
      approvedAnswers: expect.objectContaining({ tariffCode: "1234" }),
      changes: [{ field: "tariffCode", sent: "8431", approved: "1234" }],
      canAnswer: true,
    });
    await expect(service.get(ID, creator, NOW)).resolves.toMatchObject({ state: { canAnswer: false } });
  });

  it("changes nothing before an approval", async () => {
    repository.latest.mockResolvedValue(submitted());
    await expect(service.get(ID, manager, NOW)).resolves.toMatchObject({ state: { approvedAnswers: null, changes: [], canAnswer: true } });
  });
});

describe("the bell", () => {
  const waiting = (personInCharge: string, holidayCover = "") => ({ shipmentId: ID, jobNumber: "CZ00000041", submittedAt: NOW, answers, personInCharge, holidayCover });

  it("asks for the user's e-mail, and lists only what the user may answer", async () => {
    repository.waitingFor.mockResolvedValue([waiting("pic@firm.cz — Pia"), waiting("rep@firm.cz"), waiting(""), waiting("x@firm.cz", "REP@firm.cz")] as never);
    const list = await service.waitingFor(creator);
    expect(repository.waitingFor).toHaveBeenCalledWith(COMPANY, CREATOR, "rep@firm.cz");
    expect(list).toHaveLength(3);
    expect(list[0]).toEqual({ shipmentId: ID, jobNumber: "CZ00000041", submittedAt: NOW.toISOString(), filledBy: "Jan" });
  });

  it("lists everything it found for a manager", async () => {
    repository.waitingFor.mockResolvedValue([waiting("pic@firm.cz"), waiting("x@firm.cz")] as never);
    await expect(service.waitingFor(manager)).resolves.toHaveLength(2);
  });
});
