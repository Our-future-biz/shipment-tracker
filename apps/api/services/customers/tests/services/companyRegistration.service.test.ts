import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../../lib/companyUsers", () => ({ userEmailOf: vi.fn().mockResolvedValue("rep@firm.cz") }));
vi.mock("../../repositories/companyRegistration.repository", () => ({
  companyRegistrationRepository: {
    settings: vi.fn(), saveSettings: vi.fn(), createLink: vi.fn(), openLinks: vi.fn(), linkById: vi.fn(), revokeLink: vi.fn(), linkByHash: vi.fn(), claim: vi.fn(), release: vi.fn(), insert: vi.fn(), addMember: vi.fn(), addMessage: vi.fn(),
  },
}));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: { findByIco: vi.fn() } }));
vi.mock("../../services/ares.service", () => ({ aresService: { lookup: vi.fn(), search: vi.fn() } }));
vi.mock("../../services/customer.service", () => ({
  customerService: { createFromAres: vi.fn(), createManual: vi.fn() },
  firstContact: (c: { firstName: string; lastName: string; email?: string; phone?: string; role?: string }) => {
    if (!c.email && !c.phone) throw Object.assign(new Error("needs a contact"), { code: "invalid_argument" });
    return { firstName: c.firstName, lastName: c.lastName, name: `${c.firstName} ${c.lastName}`, email: c.email ?? "", phone: c.phone ?? "", role: c.role ?? "Logistics Manager", isMain: true };
  },
}));

import { companyRegistrationRepository } from "../../repositories/companyRegistration.repository";
import { customerRepository } from "../../repositories/customer.repository";
import { aresService } from "../../services/ares.service";
import { customerService } from "../../services/customer.service";
import { companyRegistrationService as service } from "../../services/companyRegistration.service";
import log from "encore.dev/log";
import { LOOKUPS_PER_LINK_HOUR, lookupAllowed, newRegistrationToken } from "../../lib/registrationLink";

const repository = vi.mocked(companyRegistrationRepository);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "22222222-2222-4222-8222-222222222222";
const LINK_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-09T10:00:00Z");
const { token } = newRegistrationToken();
const link = (over: Record<string, unknown> = {}) =>
  ({ id: LINK_ID, companyId: COMPANY, tokenHash: "h", roles: ["customer"], label: "", createdBy: "rep@firm.cz", createdByUserId: USER, createdAt: NOW, expiresAt: new Date("2026-11-20T10:00:00Z"), usedAt: null, revokedAt: null, ...over }) as never;
const contact = { firstName: "Jan", lastName: "Novák", email: "jan@dango.cz" };
const czech = { termsAccepted: true, country: "CZ", ico: "12345678", contact };
const foreign = { termsAccepted: true, country: "DE", companyName: "Test GmbH", registrationNumber: "HRB 1", street: "Weg 1", city: "Berlin", postalCode: "10115", contact };
const ares = { ico: "12345678", dic: "", companyName: "DANGO s.r.o.", registeredAddress: "Praha", city: "Praha", country: "CZ" };

beforeEach(() => {
  vi.clearAllMocks();
  repository.settings.mockResolvedValue({ companyId: COMPANY, termsName: "Austromar Terms and Conditions", termsUrl: "https://a.cz/t", updatedAt: NOW });
  repository.linkByHash.mockResolvedValue(link());
  repository.claim.mockResolvedValue(link({ usedAt: NOW }));
  repository.insert.mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444" } as never);
  vi.mocked(customerRepository.findByIco).mockResolvedValue(null);
  vi.mocked(aresService.lookup).mockResolvedValue(ares as never);
  vi.mocked(customerService.createFromAres).mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", ...ares } as never);
  vi.mocked(customerService.createManual).mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", companyName: "Test GmbH", ico: "HRB 1", dic: "", registeredAddress: "", city: "Berlin", country: "DE" } as never);
});

describe("creating a link", () => {
  const actor = { companyID: COMPANY, userID: USER, role: "user" };

  it("is open to anyone, with the roles chosen, for 14 days", async () => {
    repository.createLink.mockImplementation(async (v) => ({ ...(link() as object), ...v }) as never);
    const { url, link: item } = await service.createLink(actor, { roles: ["haulier"], label: " ACME " }, NOW);
    expect(url).toMatch(/\/register\/[\w-]{43}$/);
    expect(item).toMatchObject({ roles: ["haulier"], label: "ACME", expiresAt: "2026-11-23T10:00:00.000Z" });
    expect(JSON.stringify(repository.createLink.mock.calls[0]![0])).not.toContain(url.split("/").pop()!);
  });

  it("needs a role and the terms' address", async () => {
    await expect(service.createLink(actor, { roles: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    repository.settings.mockResolvedValue(null as never);
    await expect(service.createLink(actor, { roles: ["customer"] })).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("is not made, rather than made by nobody, when who is making it can't be read", async () => {
    const { userEmailOf } = await import("../../../../lib/companyUsers");
    const { APIError } = await import("../../../../lib/tests/encoreApi.stub");
    vi.mocked(userEmailOf).mockRejectedValueOnce(APIError.unavailable("Who you are could not be read just now — try again in a moment"));
    await expect(service.createLink(actor, { roles: ["customer"] })).rejects.toMatchObject({ code: "unavailable" });
    expect(repository.createLink).not.toHaveBeenCalled();
  });

  it("can be cancelled by the one who made it or a manager, nobody else", async () => {
    const id = "66666666-6666-4666-8666-666666666666";
    repository.linkById.mockResolvedValue(link());
    repository.revokeLink.mockResolvedValue(true);
    await expect(service.revokeLink({ ...actor, userID: "77777777-7777-4777-8777-777777777777" }, id)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.revokeLink(actor, id)).resolves.toBeUndefined();
    await expect(service.revokeLink({ ...actor, userID: "77777777-7777-4777-8777-777777777777", role: "manager" }, id)).resolves.toBeUndefined();
  });

  it("keeps the terms to a manager and to a plain web address", async () => {
    await expect(service.saveSettings(actor, { termsName: "", termsUrl: "https://a.cz/t" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.saveSettings({ ...actor, role: "manager" }, { termsName: "", termsUrl: "javascript:alert(1)" })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("the public form", () => {
  it("answers every link that doesn't open alike", async () => {
    await expect(service.publicForm("nonsense")).rejects.toMatchObject({ code: "not_found" });
    for (const over of [{ usedAt: NOW }, { revokedAt: NOW }, { expiresAt: NOW }]) {
      repository.linkByHash.mockResolvedValue(link(over));
      await expect(service.publicForm(token, NOW)).rejects.toMatchObject({ code: "not_found", message: "This registration link is no longer valid" });
    }
  });

  it("tells nothing but the terms", async () => {
    await expect(service.publicForm(token, NOW)).resolves.toEqual({ termsName: "Austromar Terms and Conditions", termsUrl: "https://a.cz/t" });
  });

  it("names the terms neutrally until a manager names them", async () => {
    repository.settings.mockResolvedValue({ companyId: COMPANY, termsName: "", termsUrl: "https://a.cz/t", updatedAt: NOW } as never);
    await expect(service.publicForm(token, NOW)).resolves.toEqual({ termsName: "Terms and Conditions", termsUrl: "https://a.cz/t" });
  });

  it("counts the link's registry searches on their own, not on the company's", async () => {
    vi.mocked(aresService.search).mockResolvedValue({ companies: [], tooMany: false });
    await service.publicAresSearch(token, "Dango", NOW);
    expect(aresService.search).toHaveBeenCalledWith(`registration-link:${LINK_ID}`, "Dango");
  });
});

describe("registering", () => {
  it("refuses terms a manager changed since the form was opened, and leaves the link usable", async () => {
    await expect(service.submit(token, { ...czech, termsUrl: "https://a.cz/old" }, NOW)).rejects.toMatchObject({ code: "failed_precondition", message: "The terms changed — reload the page" });
    expect(repository.claim).not.toHaveBeenCalled();
    await service.submit(token, { ...czech, termsUrl: "https://a.cz/t" }, NOW);
    expect(repository.claim).toHaveBeenCalled();
  });

  it("counts a Czech registration as one of the link's look-ups, and refuses it past the limit before the link is taken", async () => {
    const busy = "99999999-9999-4999-8999-999999999999";
    repository.linkByHash.mockResolvedValue(link({ id: busy }));
    for (let i = 0; i < LOOKUPS_PER_LINK_HOUR; i++) lookupAllowed(busy);
    await expect(service.submit(token, czech, NOW)).rejects.toMatchObject({ code: "resource_exhausted" });
    await expect(service.submit(token, foreign, NOW)).resolves.toBeUndefined();
    expect(repository.claim).toHaveBeenCalledTimes(1);
  });

  it("refuses without the terms accepted, and leaves the link usable", async () => {
    await expect(service.submit(token, { ...czech, termsAccepted: false }, NOW)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it("leaves the link usable after a mistake in the form", async () => {
    await expect(service.submit(token, { ...czech, ico: "12" }, NOW)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.submit(token, { ...foreign, street: " " }, NOW)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.submit(token, { ...czech, contact: { firstName: "A", lastName: "B" } }, NOW)).rejects.toThrow();
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it("creates a Czech company waiting for a manager, with the link's roles and the creator in the chat", async () => {
    await service.submit(token, czech, NOW);
    expect(customerService.createFromAres).toHaveBeenCalledWith(COMPANY, "", "12345678", contact, ["customer"], { userId: USER, quoteNumber: "", viaLink: { requestedBy: "rep@firm.cz" } });
    expect(repository.insert).toHaveBeenCalledWith(expect.objectContaining({ alreadyInDatabase: false, termsName: "Austromar Terms and Conditions", termsAcceptedAt: NOW, requestedByUserId: USER }));
    expect(repository.addMember).toHaveBeenCalledWith(COMPANY, "55555555-5555-4555-8555-555555555555", USER, null);
    expect(repository.addMessage).toHaveBeenCalledWith(expect.objectContaining({ authorUserId: null }));
  });

  it("creates a foreign company from what was typed", async () => {
    await service.submit(token, foreign, NOW);
    expect(customerService.createManual).toHaveBeenCalledWith(COMPANY, "", expect.objectContaining({ country: "DE", companyName: "Test GmbH", roles: ["customer"] }), expect.objectContaining({ viaLink: expect.anything() }));
  });

  it("creates no second company for one already in the database, and chats on the registration", async () => {
    vi.mocked(customerRepository.findByIco).mockResolvedValue({ id: "88888888-8888-4888-8888-888888888888" } as never);
    await service.submit(token, czech, NOW);
    expect(customerService.createFromAres).not.toHaveBeenCalled();
    expect(repository.insert).toHaveBeenCalledWith(expect.objectContaining({ alreadyInDatabase: true, customerId: "88888888-8888-4888-8888-888888888888" }));
    expect(repository.addMember).toHaveBeenCalledWith(COMPANY, "44444444-4444-4444-8444-444444444444", USER, null);
  });

  it("registers once: a link somebody else just took is refused", async () => {
    repository.claim.mockResolvedValue(null as never);
    await expect(service.submit(token, czech, NOW)).rejects.toMatchObject({ code: "not_found" });
    expect(customerService.createFromAres).not.toHaveBeenCalled();
  });

  it("gives the link back when the registration fails", async () => {
    vi.mocked(customerService.createFromAres).mockRejectedValue(new Error("ARES down"));
    repository.release.mockResolvedValue(undefined);
    await expect(service.submit(token, czech, NOW)).rejects.toThrow("ARES down");
    expect(repository.release).toHaveBeenCalledWith(COMPANY, LINK_ID);
  });

  it("keeps the link used once the company was created, even when the registration then fails", async () => {
    repository.insert.mockRejectedValue(new Error("db down"));
    await expect(service.submit(token, czech, NOW)).rejects.toThrow("db down");
    expect(customerService.createFromAres).toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it("keeps the link used once a registration of a company already there is being written", async () => {
    vi.mocked(customerRepository.findByIco).mockResolvedValue({ id: "88888888-8888-4888-8888-888888888888" } as never);
    repository.insert.mockRejectedValue(new Error("db down"));
    await expect(service.submit(token, foreign, NOW)).rejects.toThrow("db down");
    expect(repository.release).not.toHaveBeenCalled();
  });

  it("gives a company already there the link back when ARES fails before anything is written", async () => {
    vi.mocked(customerRepository.findByIco).mockResolvedValue({ id: "88888888-8888-4888-8888-888888888888" } as never);
    vi.mocked(aresService.lookup).mockRejectedValue(new Error("ARES down"));
    await expect(service.submit(token, czech, NOW)).rejects.toThrow("ARES down");
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.release).toHaveBeenCalledWith(COMPANY, LINK_ID);
  });

  it("registers all the same when the chat can't be started: that is only logged", async () => {
    repository.addMessage.mockRejectedValueOnce(new Error("db down"));
    await expect(service.submit(token, czech, NOW)).resolves.toBeUndefined();
    expect(repository.insert).toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.any(Error), "the chat of a registration could not be started", expect.anything());
  });
});
