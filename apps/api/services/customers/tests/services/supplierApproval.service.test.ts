import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn() } }));
vi.mock("../../repositories/supplierApproval.repository", () => ({
  supplierApprovalRepository: { list: vi.fn(), decide: vi.fn(), markSeen: vi.fn(), states: vi.fn() },
}));
vi.mock("../../services/customer.service", () => ({ customerService: { softDelete: vi.fn() } }));

import { auth } from "~encore/clients";
import { supplierApprovalRepository } from "../../repositories/supplierApproval.repository";
import { customerService } from "../../services/customer.service";
import { supplierApprovalService } from "../../services/supplierApproval.service";

const repository = vi.mocked(supplierApprovalRepository);
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
    expect(customerService.softDelete).not.toHaveBeenCalled();
  });

  it("declines only with a reason, and deletes the company", async () => {
    await expect(supplierApprovalService.decide(MANAGER, ID, "decline", " no ")).rejects.toMatchObject({ code: "invalid_argument" });
    repository.decide.mockResolvedValue(row({ approvalStatus: "declined" }));
    repository.list.mockResolvedValue([row({ approvalStatus: "declined", approvalDecision: "declined", approvalComment: "Unknown company" })]);
    await supplierApprovalService.decide(MANAGER, ID, "decline", " Unknown company ");
    expect(repository.decide).toHaveBeenCalledWith(COMPANY, ID, expect.objectContaining({ decision: "declined", comment: "Unknown company" }));
    expect(customerService.softDelete).toHaveBeenCalledWith(ID, COMPANY);
  });

  it("refuses a supplier that no longer waits", async () => {
    repository.decide.mockResolvedValue(null);
    await expect(supplierApprovalService.decide(MANAGER, ID, "approve")).rejects.toMatchObject({ code: "failed_precondition" });
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
