import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The matching is run for real against a stand-in for the repository and for the users of the
// auth service.
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../repositories/salesQuote.repository", () => ({
  salesQuoteRepository: { adoptions: vi.fn(), unexaminedOwnerLabels: vi.fn(), recordOwnerMatch: vi.fn() },
}));

import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { salesQuoteRepository } from "../../repositories/salesQuote.repository";
import { ownerBackfillService } from "../../services/ownerBackfill.service";

const repository = vi.mocked(salesQuoteRepository);
const usersList = vi.mocked(auth.usersList);

const NOW = new Date("2026-10-10T10:00:00.000Z");
const MINUTE = 60 * 1000;

const U_MARTIN = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const U_JANA = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a03";
const user = (id: string, displayName: string, email: string) => ({
  id,
  companyId: "",
  email,
  displayName,
  role: "user",
  departmentId: null,
  branchId: null,
});
const USERS = [user(U_MARTIN, "Martin Koubek", "martin@forwarder.cz"), user(U_JANA, "Jana Nováková", "jana@forwarder.cz")];

// A company of its own for every test: the service remembers companies for as long as the
// process lives.
let company: string;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  company = randomUUID();
  usersList.mockResolvedValue({ users: USERS });
  repository.adoptions.mockReturnValue(0);
  repository.unexaminedOwnerLabels.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ensureOwnersMatched", () => {
  it("gives every waiting text the user it names - nobody when it fits none or several - reading the users once", async () => {
    usersList.mockResolvedValue({ users: [...USERS, user(randomUUID(), "Jana Nováková", "jana2@forwarder.cz")] });
    repository.unexaminedOwnerLabels.mockResolvedValue(["Martin", "Petr", "Jana Nováková", ""]);

    await ownerBackfillService.ensureOwnersMatched(company);

    expect(usersList).toHaveBeenCalledTimes(1);
    expect(repository.recordOwnerMatch.mock.calls).toEqual([
      [company, "Martin", U_MARTIN],
      [company, "Petr", null],
      [company, "Jana Nováková", null],
      [company, "", null],
    ]);
  });

  it("does not ask for the users when no text is waiting", async () => {
    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.unexaminedOwnerLabels).toHaveBeenCalledWith(company);
    expect(usersList).not.toHaveBeenCalled();
    expect(repository.recordOwnerMatch).not.toHaveBeenCalled();
  });

  it("remembers a company in which nothing is left: the next reads do not look", async () => {
    repository.unexaminedOwnerLabels.mockResolvedValueOnce(["Martin"]);
    await ownerBackfillService.ensureOwnersMatched(company);
    await ownerBackfillService.ensureOwnersMatched(company);
    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.unexaminedOwnerLabels).toHaveBeenCalledTimes(1);
    // Another company is another matter.
    await ownerBackfillService.ensureOwnersMatched(randomUUID());
    expect(repository.unexaminedOwnerLabels).toHaveBeenCalledTimes(2);
  });

  it("logs a failed read of the users, stamps nothing and does not remember it: the next read tries again", async () => {
    repository.unexaminedOwnerLabels.mockResolvedValue(["Martin"]);
    usersList.mockRejectedValueOnce(new Error("auth is unreachable"));

    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.recordOwnerMatch).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);

    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(company, "Martin", U_MARTIN);
  });

  it("looks again once this process has adopted quotes of the company", async () => {
    await ownerBackfillService.ensureOwnersMatched(company);
    // A quote older code wrote was opened: its owner text is new here.
    repository.adoptions.mockReturnValue(1);
    repository.unexaminedOwnerLabels.mockResolvedValue(["Jana Nováková"]);

    await ownerBackfillService.ensureOwnersMatched(company);

    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(company, "Jana Nováková", U_JANA);
    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.unexaminedOwnerLabels).toHaveBeenCalledTimes(2);
  });

  it("looks again when quotes were adopted while it was looking", async () => {
    // The adoption lands after the texts were read: this run cannot have seen its text.
    repository.unexaminedOwnerLabels.mockImplementationOnce(async () => {
      repository.adoptions.mockReturnValue(1);
      return [];
    });
    await ownerBackfillService.ensureOwnersMatched(company);
    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.unexaminedOwnerLabels).toHaveBeenCalledTimes(2);
  });

  it("looks again after five minutes, for what this process cannot see: another instance, a repair by hand", async () => {
    await ownerBackfillService.ensureOwnersMatched(company);
    vi.setSystemTime(NOW.getTime() + 5 * MINUTE - 1);
    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.unexaminedOwnerLabels).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW.getTime() + 5 * MINUTE);
    repository.unexaminedOwnerLabels.mockResolvedValue(["Martin"]);
    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(company, "Martin", U_MARTIN);
  });
});

describe("matchOwners", () => {
  it("looks whatever is remembered: the caller holds a quote whose owner text nobody examined", async () => {
    await ownerBackfillService.ensureOwnersMatched(company);
    repository.unexaminedOwnerLabels.mockResolvedValue(["Jana Nováková"]);
    await ownerBackfillService.matchOwners(company);
    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(company, "Jana Nováková", U_JANA);
  });

  it("forgets what was remembered when the users cannot be read", async () => {
    await ownerBackfillService.ensureOwnersMatched(company);
    repository.unexaminedOwnerLabels.mockResolvedValue(["Jana Nováková"]);
    usersList.mockRejectedValueOnce(new Error("auth is unreachable"));
    await ownerBackfillService.matchOwners(company);

    // The text is known to wait: the next read does not take the company for examined.
    await ownerBackfillService.ensureOwnersMatched(company);
    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(company, "Jana Nováková", U_JANA);
  });
});
