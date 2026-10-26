import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const usersList = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { usersList } }));
const customers = vi.hoisted(() => ({ salesOwnerGroups: vi.fn(), setSalesOwnerWhere: vi.fn() }));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: customers }));
const notes = vi.hoisted(() => ({ authorGroups: vi.fn(), renameAuthor: vi.fn() }));
vi.mock("../repositories/customerNote.repository", () => ({ customerNoteRepository: notes }));

import { customerPeopleService } from "../services/peopleNormalize.service";

const user = (id: string, displayName: string, email: string) => ({ id, companyId: "co", email, displayName, role: "user", departmentId: null, branchId: null });
const USERS = [user("u1", "Lukáš Novák", "Lukas@OurFuture.biz"), user("u2", "Martin", "martin@ourfuture.biz")];

beforeEach(() => {
  vi.resetAllMocks();
  usersList.mockResolvedValue({ users: USERS });
  customers.salesOwnerGroups.mockResolvedValue([]);
  notes.authorGroups.mockResolvedValue([]);
  customers.setSalesOwnerWhere.mockImplementation(async () => 1);
  notes.renameAuthor.mockImplementation(async () => 1);
});

describe("customer people normalize", () => {
  it("records owners and note authors by the users' e-mails, in the caller's company, and lists what it left", async () => {
    customers.salesOwnerGroups.mockResolvedValue([
      { userId: "u1", label: "Lukáš Novák", count: 3 },
      { userId: "u2", label: "martin@ourfuture.biz", count: 4 },
      { userId: null, label: "Martin", count: 2 },
      { userId: null, label: "Obchod", count: 1 },
    ]);
    notes.authorGroups.mockResolvedValue([
      { value: "Lukáš Novák", count: 6 },
      { value: "Austromar", count: 2 },
    ]);
    customers.setSalesOwnerWhere.mockImplementation(async (_co, from) => (from.userId ? 3 : 2));
    notes.renameAuthor.mockResolvedValue(6);

    await expect(customerPeopleService.normalize("co")).resolves.toEqual({
      checked: 18,
      changed: 11,
      unmatched: [
        { field: "noteAuthor", value: "Austromar", count: 2 },
        { field: "salesOwner", value: "Obchod", count: 1 },
      ],
    });
    // The e-mail lower-cased, as the users list gives it out; only the rows that still hold what was read.
    expect(customers.setSalesOwnerWhere.mock.calls).toEqual([
      ["co", { userId: "u1", label: "Lukáš Novák" }, expect.objectContaining({ id: "u1", email: "lukas@ourfuture.biz" })],
      ["co", { userId: null, label: "Martin" }, expect.objectContaining({ id: "u2", email: "martin@ourfuture.biz" })],
    ]);
    expect(notes.renameAuthor).toHaveBeenCalledWith("co", "Lukáš Novák", "lukas@ourfuture.biz");
    expect(notes.renameAuthor).toHaveBeenCalledTimes(1);
  });

  it("changes nothing the second time", async () => {
    customers.salesOwnerGroups.mockResolvedValue([{ userId: "u1", label: "lukas@ourfuture.biz", count: 3 }]);
    notes.authorGroups.mockResolvedValue([{ value: "martin@ourfuture.biz", count: 2 }]);
    await expect(customerPeopleService.normalize("co")).resolves.toEqual({ checked: 5, changed: 0, unmatched: [] });
    expect(customers.setSalesOwnerWhere).not.toHaveBeenCalled();
    expect(notes.renameAuthor).not.toHaveBeenCalled();
  });

  it("fails, writing nothing, when the users cannot be read", async () => {
    usersList.mockRejectedValue(new Error("auth down"));
    await expect(customerPeopleService.normalize("co")).rejects.toThrow("auth down");
    expect(customers.setSalesOwnerWhere).not.toHaveBeenCalled();
    expect(notes.renameAuthor).not.toHaveBeenCalled();
  });
});
