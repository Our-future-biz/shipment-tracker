import { beforeEach, describe, expect, it, vi } from "vitest";

// Who a quote's stamps name: the company's users, and a superadmin working as the company by their own
// e-mail - found in their own company, as the caller only, through the real lib/companyUsers look-up.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const auth = vi.hoisted(() => ({ usersList: vi.fn(), userLookup: vi.fn() }));
vi.mock("~encore/clients", () => ({ auth }));

import { companyDirectory, companyPeople } from "../lib/people";

const ROOT = "11111111-1111-4111-8111-111111111111";
const JANA = "22222222-2222-4222-8222-222222222222";
const jana = { id: JANA, companyId: "c1", email: "Jana@Firm.cz", displayName: "Jana", role: "manager", departmentId: null, branchId: null, reportsToUserId: null };
const root = { userID: ROOT, role: "superadmin" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.usersList.mockResolvedValue({ users: [jana] });
  auth.userLookup.mockImplementation(async ({ ids, selfInOwnCompany }: { ids: string[]; selfInOwnCompany?: boolean }) => ({
    users: selfInOwnCompany && ids.includes(ROOT) ? [{ id: ROOT, name: "Root", email: "Root@Platform.cz", role: "superadmin" }] : [],
  }));
});

describe("the people a quote's stamps name", () => {
  it("add a superadmin working as the company by their own e-mail, to the e-mails only", async () => {
    const people = await companyPeople(root);
    expect(people.emails.get(ROOT)).toBe("root@platform.cz");
    expect(people.emails.get(JANA)).toBe("jana@firm.cz");
    // Nobody picks or tags them: they are no user of the company.
    expect(people.users.map((u) => u.id)).toEqual([JANA]);
    expect(auth.userLookup).toHaveBeenCalledWith({ ids: [ROOT], selfInOwnCompany: true });
  });

  it("ask nobody outside the company for anyone else", async () => {
    await companyPeople({ userID: "33333333-3333-4333-8333-333333333333", role: "user" });
    await companyPeople({ userID: JANA, role: "superadmin" });
    await companyPeople();
    expect(auth.userLookup).not.toHaveBeenCalled();
  });

  it("make the superadmin no manager of the company's inquiries", async () => {
    const directory = await companyDirectory(root);
    expect(directory.emails.get(ROOT)).toBe("root@platform.cz");
    expect([...directory.managers]).toEqual([JANA]);
    expect(directory.roles.has(ROOT)).toBe(false);
  });

  it("stay as they were when the superadmin can't be found", async () => {
    auth.userLookup.mockResolvedValue({ users: [] });
    const people = await companyPeople(root);
    expect(people.emails.has(ROOT)).toBe(false);
  });
});
