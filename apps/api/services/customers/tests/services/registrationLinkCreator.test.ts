import { beforeEach, describe, expect, it, vi } from "vitest";

// Who created a registration link, as the link keeps it: the real look-up (lib/companyUsers) against a
// stand-in for the auth service, which finds the caller themself in their own company only when asked.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
const ROOT = "11111111-1111-4111-8111-111111111111";
const REP = "22222222-2222-4222-8222-222222222222";
const userLookup = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup } }));
vi.mock("../../repositories/companyRegistration.repository", () => ({ companyRegistrationRepository: { settings: vi.fn(), createLink: vi.fn() } }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: {} }));
vi.mock("../../services/ares.service", () => ({ aresService: {} }));
vi.mock("../../services/customer.service", () => ({ customerService: {}, firstContact: vi.fn() }));

import { companyRegistrationRepository } from "../../repositories/companyRegistration.repository";
import { companyRegistrationService as service } from "../../services/companyRegistration.service";

const repository = vi.mocked(companyRegistrationRepository);
const TENANT = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// The tenant's own users; the superadmin is a user of the platform company only.
const TENANT_USERS = [{ id: REP, name: "Rep", email: "Rep@Firm.cz", role: "user" }];
const PLATFORM_SELF = { id: ROOT, name: "Root", email: "Root@Platform.cz", role: "superadmin" };

beforeEach(() => {
  vi.clearAllMocks();
  repository.settings.mockResolvedValue({ companyId: TENANT, termsName: "Terms and Conditions", termsUrl: "https://a.cz/t", updatedAt: new Date() } as never);
  repository.createLink.mockImplementation(async (v) => ({ id: "33333333-3333-4333-8333-333333333333", createdAt: new Date(), usedAt: null, revokedAt: null, ...v }) as never);
  // The superadmin is the caller in these requests: found outside the tenant only as themself, only when asked.
  userLookup.mockImplementation(async ({ ids, selfInOwnCompany }: { ids: string[]; selfInOwnCompany?: boolean }) => ({
    users: [...TENANT_USERS.filter((u) => ids.includes(u.id)), ...(selfInOwnCompany && ids.includes(ROOT) ? [PLATFORM_SELF] : [])],
  }));
});

describe("a registration link's creator", () => {
  it("is the superadmin's own e-mail when a superadmin working as the company creates it", async () => {
    const { link } = await service.createLink({ companyID: TENANT, userID: ROOT, role: "superadmin" }, { roles: ["customer"] });
    expect(link.createdBy).toBe("root@platform.cz");
    expect(repository.createLink).toHaveBeenCalledWith(expect.objectContaining({ companyId: TENANT, createdBy: "root@platform.cz", createdByUserId: ROOT }));
    expect(userLookup).toHaveBeenCalledWith({ ids: [ROOT], selfInOwnCompany: true });
  });

  it("is the colleague's e-mail for one of the company's own users", async () => {
    const { link } = await service.createLink({ companyID: TENANT, userID: REP, role: "user" }, { roles: ["customer"] });
    expect(link.createdBy).toBe("rep@firm.cz");
  });
});
