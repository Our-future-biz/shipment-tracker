import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; the repositories are stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/auth", () => ({ getAuthData: () => null }));
const posts = vi.hoisted(() => ({
  createForCompany: vi.fn(),
  listForAudience: vi.fn(),
  getByIdForCompany: vi.fn(),
}));
vi.mock("../repositories/announcement.repository", () => ({ announcementRepository: posts }));
vi.mock("../repositories/announcementAttachment.repository", () => ({ announcementAttachmentRepository: { listMeta: vi.fn(async () => []) } }));
const org = vi.hoisted(() => ({
  countries: { listByName: vi.fn(), namesByCodes: vi.fn() },
  branches: { listByName: vi.fn(), namesByIds: vi.fn(), getByIdForCompany: vi.fn() },
  departments: { listByName: vi.fn(), namesByIds: vi.fn(), getByIdForCompany: vi.fn() },
}));
vi.mock("../repositories/orgUnit.repository", () => ({
  countryRepository: org.countries,
  branchRepository: org.branches,
  departmentRepository: org.departments,
}));
vi.mock("../repositories/user.repository", () => ({ userRepository: { getByIdInCompany: vi.fn(async () => ({ departmentId: null, branchId: null })) } }));

import { announcementService } from "../services/announcement.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const BRNO = "11111111-1111-4111-8111-111111111111";
const MUNICH = "22222222-2222-4222-8222-222222222222";
const FCL = "33333333-3333-4333-8333-333333333333";
const LCL = "44444444-4444-4444-8444-444444444444";
const ELSEWHERE = "55555555-5555-4555-8555-555555555555";
const manager = { userID: "66666666-6666-4666-8666-666666666666", companyID: COMPANY, role: "manager" };

// The organization as its pickers offer it: live rows only.
const COUNTRIES = [
  { code: "CZ", name: "Czechia" },
  { code: "DE", name: "Germany" },
];
const BRANCHES = [
  { id: BRNO, name: "Brno", country: "Czechia", countryCode: "CZ" },
  { id: MUNICH, name: "Munich", country: "Germany", countryCode: "DE" },
];
const DEPARTMENTS = [
  { id: FCL, name: "FCL" },
  { id: LCL, name: "LCL" },
];

const post = (input: Record<string, unknown>) => announcementService.create(manager, { title: "Port closed", ...input } as never);
const stored = () => posts.createForCompany.mock.calls[0]![1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  org.countries.listByName.mockResolvedValue(COUNTRIES);
  org.branches.listByName.mockResolvedValue(BRANCHES);
  org.departments.listByName.mockResolvedValue(DEPARTMENTS);
  posts.createForCompany.mockImplementation(async () => ({ id: "post-1" }));
});

describe("an audience notice from a page loaded before several could be chosen (review of system-23)", () => {
  it("takes its one branch as a list of one, not as a notice to everyone", async () => {
    const created = await post({ scope: "audience", branchId: BRNO });
    expect(stored()).toMatchObject({ scope: "audience", countryCodes: [], branchIds: [BRNO], departmentIds: [] });
    expect(created).toEqual({ id: "post-1", target: "Brno" });
  });

  it("takes its one country and department too, merged with any lists, each once", async () => {
    await post({ scope: "audience", countryCodes: ["CZ", "cz"], countryCode: " de ", branchIds: [BRNO], branchId: MUNICH, departmentIds: [FCL, LCL], departmentId: FCL });
    expect(stored()).toMatchObject({ scope: "audience", countryCodes: ["CZ", "DE"], branchIds: [BRNO, MUNICH], departmentIds: [FCL, LCL] });
    await post({ scope: "audience", countryCode: "CZ", departmentId: LCL });
    expect(posts.createForCompany.mock.calls[1]![1]).toMatchObject({ scope: "audience", countryCodes: ["CZ"], branchIds: [], departmentIds: [LCL] });
  });

  it("refuses an audience with nothing chosen instead of making it a company notice", async () => {
    for (const nothing of [{}, { countryCodes: [], branchIds: [], departmentIds: [] }, { countryCode: " ", branchId: "" }]) {
      await expect(post({ scope: "audience", ...nothing })).rejects.toMatchObject({ code: "invalid_argument" });
    }
    expect(posts.createForCompany).not.toHaveBeenCalled();
  });
});

describe("whom an audience notice is for", () => {
  it("is the organization's own countries, branches and departments, each once, named as on the board", async () => {
    const created = await post({ scope: "audience", countryCodes: ["cz", "CZ", "DE"], branchIds: [BRNO, BRNO, MUNICH], departmentIds: [LCL, FCL, LCL] });
    expect(stored()).toMatchObject({
      scope: "audience",
      countryCodes: ["CZ", "DE"],
      branchIds: [BRNO, MUNICH],
      departmentIds: [LCL, FCL],
      // The older scopes' single columns stay empty.
      departmentId: null,
      branchId: null,
      country: null,
      countryCode: null,
    });
    expect(created.target).toBe("Czechia, Germany · Brno, Munich · LCL, FCL");
  });

  it("refuses a country, branch or department the organization doesn't have (or has removed)", async () => {
    await expect(post({ scope: "audience", countryCodes: ["CZ", "PL"] })).rejects.toThrow("Choose the organization's own countries");
    await expect(post({ scope: "audience", branchIds: [BRNO, ELSEWHERE] })).rejects.toThrow("Choose the organization's own branches");
    await expect(post({ scope: "audience", departmentIds: [ELSEWHERE] })).rejects.toThrow("Choose the organization's own departments");
    expect(posts.createForCompany).not.toHaveBeenCalled();
  });

  it("refuses a branch outside the countries chosen", async () => {
    await expect(post({ scope: "audience", countryCodes: ["DE"], branchIds: [MUNICH, BRNO] })).rejects.toThrow("Brno is not in the countries chosen");
    await expect(post({ scope: "audience", countryCodes: ["DE"], branchId: BRNO })).rejects.toThrow("Brno is not in the countries chosen");
    expect(posts.createForCompany).not.toHaveBeenCalled();
  });

  it("takes branches of any country when no country is chosen", async () => {
    await post({ scope: "audience", branchIds: [BRNO, MUNICH] });
    expect(stored()).toMatchObject({ scope: "audience", countryCodes: [], branchIds: [BRNO, MUNICH] });
  });

  it("is everyone for a company notice, which keeps no lists", async () => {
    const created = await post({ scope: "company", branchIds: [BRNO] });
    expect(stored()).toMatchObject({ scope: "company", countryCodes: [], branchIds: [], departmentIds: [] });
    expect(created.target).toBe("All");
    expect(org.branches.listByName).not.toHaveBeenCalled();
  });
});

describe("the board names an audience notice's countries, branches and departments", () => {
  const audiencePost = {
    id: "post-1",
    scope: "audience",
    departmentId: null,
    branchId: null,
    country: null,
    countryCode: null,
    countryCodes: ["AT", "CZ"],
    branchIds: [BRNO],
    departmentIds: [FCL, ELSEWHERE],
    severity: "info",
    title: "Port closed",
    body: "",
    authorId: manager.userID,
    createdAt: new Date("2026-11-22T10:00:00Z"),
    updatedAt: new Date("2026-11-22T10:00:00Z"),
    authorName: "Eva",
    authorEmail: "eva@firma.cz",
    departmentName: null,
    branchName: null,
    branchCountryCode: null,
    readAt: null,
  };

  it("by name even when one was removed since, its key only when it is not there at all (review of system-23)", async () => {
    posts.listForAudience.mockResolvedValue([audiencePost]);
    // Austria and the Brno branch were removed from the organization after the notice was posted.
    org.countries.listByName.mockResolvedValue([{ code: "CZ", name: "Czechia" }]);
    org.branches.listByName.mockResolvedValue([]);
    org.countries.namesByCodes.mockResolvedValue([
      { code: "AT", name: "Austria" },
      { code: "CZ", name: "Czechia" },
      // A country removed and picked again: the live row comes first and names it.
      { code: "CZ", name: "Czech Republic" },
    ]);
    org.branches.namesByIds.mockResolvedValue([{ id: BRNO, name: "Brno" }]);
    org.departments.namesByIds.mockResolvedValue([{ id: FCL, name: "FCL" }]);
    const { announcements } = await announcementService.list(manager);
    expect(announcements[0]!.target).toBe(`Austria, Czechia · Brno · FCL, ${ELSEWHERE}`);
    // Looked up once for the whole list, by the keys the notices carry, for the reader's company.
    expect(org.countries.namesByCodes).toHaveBeenCalledWith(COMPANY, ["AT", "CZ"]);
    expect(org.branches.namesByIds).toHaveBeenCalledWith(COMPANY, [BRNO]);
    expect(org.departments.namesByIds).toHaveBeenCalledWith(COMPANY, [FCL, ELSEWHERE]);
  });

  it("looks nothing up when no notice on the board is an audience one", async () => {
    posts.listForAudience.mockResolvedValue([{ ...audiencePost, scope: "company", countryCodes: [], branchIds: [], departmentIds: [] }]);
    const { announcements } = await announcementService.list(manager);
    expect(announcements[0]!.target).toBe("All");
    expect(org.countries.namesByCodes).not.toHaveBeenCalled();
    expect(org.branches.namesByIds).not.toHaveBeenCalled();
  });
});
