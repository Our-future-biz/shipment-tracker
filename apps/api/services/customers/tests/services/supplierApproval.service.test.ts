import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn() } }));
vi.mock("../../repositories/supplierApproval.repository", () => ({
  supplierApprovalRepository: { list: vi.fn(), decide: vi.fn(), markSeen: vi.fn(), states: vi.fn() },
}));
vi.mock("../../repositories/companyRegistration.repository", () => ({
  companyRegistrationRepository: { forApprovals: vi.fn(), duplicateById: vi.fn(), ofCustomer: vi.fn(), answer: vi.fn(), reopen: vi.fn(), markSeen: vi.fn() },
}));
vi.mock("../../services/customer.service", () => ({ customerService: { announceDeleted: vi.fn(), undoDecline: vi.fn(), addRoles: vi.fn() } }));
vi.mock("../../services/contact.service", () => ({ contactService: { create: vi.fn() } }));
vi.mock("../../services/note.service", () => ({ noteService: { create: vi.fn() } }));

import { auth } from "~encore/clients";
import { supplierApprovalRepository } from "../../repositories/supplierApproval.repository";
import { companyRegistrationRepository } from "../../repositories/companyRegistration.repository";
import { contactService } from "../../services/contact.service";
import { customerService } from "../../services/customer.service";
import { noteService } from "../../services/note.service";
import { supplierApprovalService } from "../../services/supplierApproval.service";

const repository = vi.mocked(supplierApprovalRepository);
const registrations = vi.mocked(companyRegistrationRepository);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const MANAGER = { companyID: COMPANY, userID: "11111111-1111-4111-8111-111111111111", role: "manager" };
const ID = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: ID, companyName: "DANGO s.r.o.", ico: "12345678", dic: "", registeredAddress: "", city: "", country: "CZ", dataSource: "ARES", roles: ["haulier"],
    approvalStatus: "pending", approvalRequestedBy: "rep@firm.cz", approvalRequestedByUserId: "22222222-2222-4222-8222-222222222222",
    approvalRequestedAt: new Date("2026-11-05T08:00:00Z"), approvalQuoteNumber: "QCZ1", approvalDecision: "", approvalDecidedBy: "",
    approvalDecidedAt: null, approvalComment: "", approvalAnswerSeenAt: null, contactName: "Jan Novák", contactEmail: "", contactPhone: "", ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.userLookup).mockResolvedValue({ users: [{ id: MANAGER.userID, email: "Boss@Firm.cz", displayName: "Boss" }] } as never);
  registrations.forApprovals.mockResolvedValue([]);
  registrations.duplicateById.mockResolvedValue(null);
  registrations.ofCustomer.mockResolvedValue(null);
  repository.states.mockResolvedValue([]);
});

const REG = "7a2d3c4e-5f60-4a1b-9c2d-3e4f5a6b7c8d";
const EXISTING = "8b3e4d5f-6071-4b2c-8d3e-4f5a6b7c8d9e";
const registration = (over: Record<string, unknown> = {}) =>
  ({
    id: REG, companyId: COMPANY, linkId: "link", customerId: EXISTING, alreadyInDatabase: true, companyName: "DANGO s.r.o.", ico: "12345678", dic: "", registeredAddress: "", city: "", country: "CZ",
    dataSource: "ARES", roles: ["customer"], contactFirstName: "Jan", contactLastName: "Novák", contactEmail: "jan@dango.cz", contactPhone: "", contactRole: null, termsName: "Austromar Terms and Conditions",
    termsUrl: "https://austromar.cz/terms", termsAcceptedAt: new Date("2026-11-09T08:00:00Z"), requestedBy: "rep@firm.cz", requestedByUserId: "22222222-2222-4222-8222-222222222222",
    createdAt: new Date("2026-11-09T08:00:00Z"), status: "pending", decidedBy: "", decidedAt: null, comment: "", answerSeenAt: null, ...over,
  }) as never;

describe("a company registered through a link", () => {
  it("shows the terms it accepted beside a new company", async () => {
    repository.list.mockResolvedValue([row({ approvalQuoteNumber: "" })]);
    registrations.forApprovals.mockResolvedValue([registration({ customerId: ID, alreadyInDatabase: false })]);
    const [item] = await supplierApprovalService.list(COMPANY);
    expect(item).toMatchObject({ customerId: ID, threadId: ID, registered: true, alreadyInDatabase: false, termsName: "Austromar Terms and Conditions" });
  });

  it("lists one already in the database on its own, without marking the company as waiting", async () => {
    repository.list.mockResolvedValue([]);
    registrations.forApprovals.mockResolvedValue([registration()]);
    const [item] = await supplierApprovalService.list(COMPANY);
    expect(item).toMatchObject({ customerId: EXISTING, threadId: REG, alreadyInDatabase: true, status: "pending", contactName: "Jan Novák" });
  });

  it("names the company it matched by that company's own name, whatever the form said", async () => {
    repository.list.mockResolvedValue([]);
    registrations.forApprovals.mockResolvedValue([registration({ companyName: "Typed GmbH" })]);
    repository.states.mockResolvedValue([{ id: EXISTING, companyName: "DANGO s.r.o.", approvalStatus: "", approvalComment: "", deletedAt: null }]);
    const [item] = await supplierApprovalService.list(COMPANY);
    expect(repository.states).toHaveBeenCalledWith(COMPANY, [EXISTING]);
    expect(item).toMatchObject({ companyName: "Typed GmbH", matchedCompanyName: "DANGO s.r.o." });
  });

  it("files the terms under a new company once it is approved", async () => {
    repository.decide.mockResolvedValue(row({ approvalStatus: "", approvalDecision: "approved" }));
    repository.list.mockResolvedValue([row({ approvalStatus: "", approvalDecision: "approved" })]);
    registrations.ofCustomer.mockResolvedValue(registration({ customerId: ID, alreadyInDatabase: false }));
    await supplierApprovalService.decide(MANAGER, ID, "approve");
    expect(registrations.answer).toHaveBeenCalledWith(COMPANY, REG, expect.objectContaining({ status: "approved" }), expect.any(Date));
    expect(noteService.create).toHaveBeenCalledWith(COMPANY, ID, MANAGER.userID, { content: expect.stringContaining("Austromar Terms and Conditions") });
  });

  it("adds the link's roles, the terms and the contact to the existing company when approved, and creates no second one", async () => {
    registrations.duplicateById.mockResolvedValue(registration({ roles: ["haulier"] }));
    registrations.answer.mockResolvedValue(registration({ status: "approved" }));
    registrations.forApprovals.mockResolvedValue([registration({ status: "approved" })]);
    repository.list.mockResolvedValue([]);
    await supplierApprovalService.decide(MANAGER, REG, "approve");
    expect(repository.decide).not.toHaveBeenCalled();
    expect(registrations.answer).toHaveBeenCalledWith(COMPANY, REG, expect.objectContaining({ status: "approved" }), expect.any(Date));
    expect(customerService.addRoles).toHaveBeenCalledWith(EXISTING, COMPANY, "manager", ["haulier"], MANAGER.userID);
    expect(contactService.create).toHaveBeenCalledWith(COMPANY, EXISTING, expect.objectContaining({ firstName: "Jan", email: "jan@dango.cz" }));
    expect(noteService.create).toHaveBeenCalledWith(COMPANY, EXISTING, MANAGER.userID, expect.anything());
    // The contact last: an answer given again after a failure never adds it twice.
    const order = (fn: unknown) => vi.mocked(fn as () => void).mock.invocationCallOrder[0]!;
    expect(order(customerService.addRoles)).toBeLessThan(order(noteService.create));
    expect(order(noteService.create)).toBeLessThan(order(contactService.create));
  });

  it("adds no contact and goes back to waiting when the roles or the note can't be written", async () => {
    registrations.duplicateById.mockResolvedValue(registration());
    registrations.answer.mockResolvedValue(registration({ status: "approved" }));
    vi.mocked(customerService.addRoles).mockRejectedValueOnce(new Error("haulier terms first"));
    await expect(supplierApprovalService.decide(MANAGER, REG, "approve")).rejects.toThrow("haulier terms first");
    vi.mocked(noteService.create).mockRejectedValueOnce(new Error("deleted"));
    await expect(supplierApprovalService.decide(MANAGER, REG, "approve")).rejects.toThrow("deleted");
    expect(contactService.create).not.toHaveBeenCalled();
    expect(registrations.reopen).toHaveBeenCalledTimes(2);
    expect(registrations.reopen).toHaveBeenCalledWith(COMPANY, REG);
  });

  it("leaves the existing company alone when declined", async () => {
    registrations.duplicateById.mockResolvedValue(registration());
    registrations.answer.mockResolvedValue(registration({ status: "declined" }));
    registrations.forApprovals.mockResolvedValue([registration({ status: "declined", comment: "not ours" })]);
    repository.list.mockResolvedValue([]);
    await supplierApprovalService.decide(MANAGER, REG, "decline", "not ours");
    expect(contactService.create).not.toHaveBeenCalled();
    expect(customerService.addRoles).not.toHaveBeenCalled();
    expect(customerService.announceDeleted).not.toHaveBeenCalled();
  });

  it("goes back to waiting when the contact can't be added, and refuses a second answer", async () => {
    registrations.duplicateById.mockResolvedValue(registration());
    registrations.answer.mockResolvedValueOnce(registration({ status: "approved" }));
    vi.mocked(contactService.create).mockRejectedValueOnce(new Error("deleted"));
    await expect(supplierApprovalService.decide(MANAGER, REG, "approve")).rejects.toThrow("deleted");
    expect(registrations.reopen).toHaveBeenCalledWith(COMPANY, REG);
    registrations.answer.mockResolvedValueOnce(null);
    await expect(supplierApprovalService.decide(MANAGER, REG, "approve")).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("decide", () => {
  it("is a manager's: anyone else is refused before anything is written", async () => {
    await expect(supplierApprovalService.decide({ ...MANAGER, role: "user" }, ID, "approve")).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it("approves, recording who", async () => {
    repository.decide.mockResolvedValue(row({ approvalStatus: "", approvalDecision: "approved" }));
    repository.list.mockResolvedValue([row({ approvalStatus: "", approvalDecision: "approved" })]);
    const item = await supplierApprovalService.decide(MANAGER, ID, "approve");
    expect(repository.decide).toHaveBeenCalledWith(COMPANY, ID, { decision: "approved", by: "boss@firm.cz", byUserId: MANAGER.userID, comment: "" });
    expect(item).toMatchObject({ customerId: ID, status: "", decision: "approved" });
    expect(customerService.announceDeleted).not.toHaveBeenCalled();
  });

  it("declines only with a reason; the company was deleted with the answer, and its copies are told", async () => {
    await expect(supplierApprovalService.decide(MANAGER, ID, "decline", " no ")).rejects.toMatchObject({ code: "invalid_argument" });
    const declined = row({ approvalStatus: "declined", deletedAt: new Date() });
    repository.decide.mockResolvedValue(declined);
    repository.list.mockResolvedValue([row({ approvalStatus: "declined", approvalDecision: "declined", approvalComment: "Unknown company" })]);
    await supplierApprovalService.decide(MANAGER, ID, "decline", " Unknown company ");
    expect(repository.decide).toHaveBeenCalledWith(COMPANY, ID, expect.objectContaining({ decision: "declined", comment: "Unknown company" }));
    expect(customerService.announceDeleted).toHaveBeenCalledWith(COMPANY, declined);
  });

  it("refuses a supplier that no longer waits", async () => {
    repository.decide.mockResolvedValue(null);
    await expect(supplierApprovalService.decide(MANAGER, ID, "approve")).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("undoDecline", () => {
  it("is a manager's: anyone else is refused before anything is written", async () => {
    await expect(supplierApprovalService.undoDecline({ ...MANAGER, role: "user" }, ID)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(supplierApprovalService.undoDecline(MANAGER, "nope")).rejects.toMatchObject({ code: "invalid_argument" });
    expect(customerService.undoDecline).not.toHaveBeenCalled();
  });

  it("brings the company back of the manager's own company, waiting again", async () => {
    repository.list.mockResolvedValue([row()]);
    await expect(supplierApprovalService.undoDecline(MANAGER, ID)).resolves.toMatchObject({ customerId: ID, status: "pending", decision: "" });
    expect(customerService.undoDecline).toHaveBeenCalledWith(ID, COMPANY);
  });

  it("sends a declined registration of a company already in the database back to waiting, in the manager's company", async () => {
    registrations.duplicateById.mockResolvedValue(registration({ status: "declined" }));
    registrations.reopen.mockResolvedValue(registration());
    registrations.forApprovals.mockResolvedValue([registration()]);
    repository.list.mockResolvedValue([]);
    await expect(supplierApprovalService.undoDecline(MANAGER, REG)).resolves.toMatchObject({ threadId: REG, status: "pending" });
    expect(registrations.duplicateById).toHaveBeenCalledWith(COMPANY, REG);
    expect(registrations.reopen).toHaveBeenCalledWith(COMPANY, REG);
    expect(customerService.undoDecline).not.toHaveBeenCalled();
  });
});

describe("states", () => {
  it("say which linked suppliers hold a quote: waiting or declined, not one deleted otherwise", async () => {
    const other = "33333333-3333-4333-8333-333333333333";
    const deleted = "44444444-4444-4444-8444-444444444444";
    repository.states.mockResolvedValue([
      { id: ID, companyName: "DANGO", approvalStatus: "declined", approvalComment: "No", deletedAt: new Date() },
      { id: other, companyName: "Waits", approvalStatus: "pending", approvalComment: "", deletedAt: null },
      { id: deleted, companyName: "Gone", approvalStatus: "", approvalComment: "", deletedAt: new Date() },
    ] as never);
    const missing = "55555555-5555-4555-8555-555555555555";
    await expect(supplierApprovalService.states(COMPANY, [ID.toUpperCase(), other, deleted, missing, "nope"])).resolves.toEqual([
      { id: ID, companyName: "DANGO", status: "declined", comment: "No" },
      { id: other, companyName: "Waits", status: "pending", comment: "" },
      { id: deleted, companyName: "Gone", status: "", comment: "" },
      { id: missing, companyName: "", status: "missing", comment: "" },
    ]);
  });
});
