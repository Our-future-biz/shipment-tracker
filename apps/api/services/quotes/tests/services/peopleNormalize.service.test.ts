import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The run is made for real - with the owner backfill's matching - against a stand-in for the
// repository and for the users of the auth service. What the statements do to rows is not checked here.
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../repositories/salesQuote.repository", () => ({
  salesQuoteRepository: {
    adoptions: vi.fn(),
    adoptPending: vi.fn(),
    unexaminedOwnerLabels: vi.fn(),
    recordOwnerMatch: vi.fn(),
    relabelOwner: vi.fn(),
    ownerCounts: vi.fn(),
  },
}));

import { auth } from "~encore/clients";
import { salesQuoteRepository } from "../../repositories/salesQuote.repository";
import { quotePeopleService } from "../../services/peopleNormalize.service";

const repository = vi.mocked(salesQuoteRepository);
const usersList = vi.mocked(auth.usersList);

const U_MARTIN = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const U_JANA = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a03";
const U_GONE = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a09";
const user = (id: string, displayName: string, email: string) => ({ id, companyId: "", email, displayName, role: "user", departmentId: null, branchId: null });
const USERS = [user(U_MARTIN, "Martin Koubek", "Martin@Forwarder.cz"), user(U_JANA, "Jana Nováková", "jana@forwarder.cz")];

let company: string;

beforeEach(() => {
  vi.resetAllMocks();
  company = randomUUID();
  usersList.mockResolvedValue({ users: USERS });
  repository.adoptions.mockReturnValue(0);
  repository.unexaminedOwnerLabels.mockResolvedValue([]);
  repository.recordOwnerMatch.mockResolvedValue([]);
  repository.relabelOwner.mockResolvedValue([]);
  repository.ownerCounts.mockResolvedValue([]);
});

describe("quote people normalize", () => {
  it("adopts old quotes first, then links the texts nobody compared yet, then records every owner by e-mail", async () => {
    repository.unexaminedOwnerLabels.mockResolvedValue(["Jana Nováková", "Petr"]);
    repository.recordOwnerMatch.mockImplementation(async (_company, label, owner) => (owner ? [`linked-${label}`] : []));

    await quotePeopleService.normalize(company);

    expect(repository.adoptPending).toHaveBeenCalledWith(company);
    // Matched by the backfill's rule: the one user a text names - owning the quotes under that
    // user's e-mail - or nobody.
    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(company, "Jana Nováková", { userId: U_JANA, label: "jana@forwarder.cz" });
    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(company, "Petr", null);
    // The e-mail as the users list has it, lower-cased.
    expect(repository.relabelOwner.mock.calls).toEqual([
      [company, U_MARTIN, "martin@forwarder.cz"],
      [company, U_JANA, "jana@forwarder.cz"],
    ]);
    const order = [repository.adoptPending, repository.recordOwnerMatch, repository.relabelOwner].map((step) => step.mock.invocationCallOrder[0]!);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("counts the quotes looked at and changed - a quote linked and relabelled once - and lists the texts left", async () => {
    repository.unexaminedOwnerLabels.mockResolvedValue(["Jana Nováková"]);
    repository.recordOwnerMatch.mockResolvedValue(["q1", "q2"]);
    repository.relabelOwner.mockImplementation(async (_company, userId) => (userId === U_JANA ? ["q1", "q2", "q3"] : ["q4"]));
    repository.ownerCounts.mockResolvedValue([
      { ownerUserId: U_JANA, ownerLabel: "jana@forwarder.cz", count: 3 },
      { ownerUserId: U_MARTIN, ownerLabel: "martin@forwarder.cz", count: 5 },
      // Somebody who left keeps the label the quotes have: linked, not listed.
      { ownerUserId: U_GONE, ownerLabel: "Karel", count: 1 },
      { ownerUserId: null, ownerLabel: "Petr", count: 2 },
      { ownerUserId: null, ownerLabel: "Obchod", count: 4 },
    ]);

    await expect(quotePeopleService.normalize(company)).resolves.toEqual({
      checked: 15,
      changed: 4,
      unmatched: [
        { field: "owner", value: "Obchod", count: 4 },
        { field: "owner", value: "Petr", count: 2 },
      ],
    });
  });

  it("changes nothing the second time", async () => {
    repository.ownerCounts.mockResolvedValue([{ ownerUserId: U_JANA, ownerLabel: "jana@forwarder.cz", count: 3 }]);
    await expect(quotePeopleService.normalize(company)).resolves.toEqual({ checked: 3, changed: 0, unmatched: [] });
  });

  it("fails, writing nothing, when the users cannot be read", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    await expect(quotePeopleService.normalize(company)).rejects.toThrow("auth is unreachable");
    expect(repository.recordOwnerMatch).not.toHaveBeenCalled();
    expect(repository.relabelOwner).not.toHaveBeenCalled();
  });
});
