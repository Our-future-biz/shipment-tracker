import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against a stand-in for the repository.
// Logo links are signed with a secret, which needs the Encore runtime.
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../db/db", () => ({ db: {} }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../repositories/customer.repository", () => ({
  customerRepository: {
    pipelineList: vi.fn(),
    listFiltered: vi.fn(),
    findByIco: vi.fn(),
    createWithContact: vi.fn(),
    getByIdForCompany: vi.fn(),
    updateForCompany: vi.fn(),
    activate: vi.fn(),
  },
}));
vi.mock("../../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
// The change events need the Encore runtime; what is published is checked in ../customer.service.test.ts.
vi.mock("../../topics", () => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }));

import { customerRepository } from "../../repositories/customer.repository";
import { aresService } from "../../services/ares.service";
import { customerService } from "../../services/customer.service";

const repository = vi.mocked(customerRepository);
const ares = vi.mocked(aresService);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

// Only what the mapper reads; the rest of a row does not matter to these tests.
const customerRow = (over: Record<string, unknown> = {}) =>
  ({
    id: "customer-1", companyName: "ITTEC, s.r.o.", roles: ["customer"], registrationDate: null, lastActivityDate: null,
    createdAt: new Date("2026-09-01T08:00:00.000Z"), updatedAt: new Date("2026-09-01T08:00:00.000Z"), ...over,
  }) as never;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("pipelineList", () => {
  it("hands out the company's customers as the pipeline needs them, the creation time as an ISO string", async () => {
    repository.pipelineList.mockResolvedValue([
      { id: "customer-1", companyName: "ITTEC, s.r.o.", status: "Prospect", label: "TARGET CUSTOMER", salesOwner: "Martin", createdAt: new Date("2026-09-01T08:00:00.123Z") },
      { id: "customer-2", companyName: "RAVAK a.s.", status: "Active", label: "KEY ACCOUNT", salesOwner: "", createdAt: new Date("2026-08-01T08:00:00.000Z") },
    ]);
    await expect(customerService.pipelineList(COMPANY)).resolves.toEqual([
      { id: "customer-1", companyName: "ITTEC, s.r.o.", status: "Prospect", label: "TARGET CUSTOMER", salesOwner: "Martin", createdAt: "2026-09-01T08:00:00.123Z" },
      { id: "customer-2", companyName: "RAVAK a.s.", status: "Active", label: "KEY ACCOUNT", salesOwner: "", createdAt: "2026-08-01T08:00:00.000Z" },
    ]);
    expect(repository.pipelineList).toHaveBeenCalledWith(COMPANY);
  });
});

describe("roles", () => {
  const CONTACT = { firstName: "Jana", lastName: "Nová", email: "jana@example.cz" };

  it("are passed on as a list filter, and every item carries its roles", async () => {
    repository.listFiltered.mockResolvedValue({ rows: [customerRow({ roles: ["customer", "haulier"] })], total: 1 });
    const { data: [item], total } = await customerService.list(COMPANY, { role: "haulier" });
    expect(repository.listFiltered).toHaveBeenCalledWith(COMPANY, { role: "haulier" });
    expect(item!.roles).toEqual(["customer", "haulier"]);
    expect(total).toBe(1);
  });

  it("make a new company a customer unless others are given", async () => {
    repository.findByIco.mockResolvedValue(null);
    ares.lookup.mockResolvedValue({ ico: "12345678", registrationDate: "" } as never);
    repository.createWithContact.mockResolvedValue(customerRow());
    await customerService.createFromAres(COMPANY, "12345678", CONTACT);
    expect(repository.createWithContact).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ roles: ["customer"] }), expect.anything(), expect.anything());

    await customerService.createFromAres(COMPANY, "12345678", CONTACT, ["haulier"]);
    expect(repository.createWithContact).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ roles: ["haulier"] }), expect.anything(), expect.anything());
  });

  it("are stored once each when changed", async () => {
    repository.updateForCompany.mockResolvedValue(customerRow({ roles: ["haulier", "customer"] }));
    await customerService.update("customer-1", COMPANY, "manager", { roles: ["haulier", "customer", "haulier"] });
    expect(repository.updateForCompany).toHaveBeenCalledWith("customer-1", COMPANY, { roles: ["haulier", "customer"] });
  });

  it("can't be emptied: a company is always at least a customer or a haulier", async () => {
    await expect(customerService.update("customer-1", COMPANY, "manager", { roles: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(customerService.createFromAres(COMPANY, "12345678", CONTACT, [])).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(repository.createWithContact).not.toHaveBeenCalled();
  });

  it("are changed only by a manager (a haulier role reaches Trucking and its payables)", async () => {
    await expect(customerService.update("customer-1", COMPANY, "user", { roles: ["haulier"] })).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("stay as they are when a change does not send them", async () => {
    repository.updateForCompany.mockResolvedValue(customerRow());
    await customerService.update("customer-1", COMPANY, "user", { companyName: "ITTEC" });
    expect(repository.updateForCompany).toHaveBeenCalledWith("customer-1", COMPANY, { companyName: "ITTEC" });
  });
});

describe("activate", () => {
  it("is one conditional write in the repository: true when a row changed", async () => {
    repository.activate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(customerService.activate("customer-1", COMPANY)).resolves.toBe(true);
    // Already Active, deleted or of another company: nothing matched, nothing written.
    await expect(customerService.activate("customer-1", COMPANY)).resolves.toBe(false);
    expect(repository.activate).toHaveBeenCalledWith("customer-1", COMPANY);
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });
});
