import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against a stand-in for the repository.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../db/db", () => ({ db: {} }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../repositories/customer.repository", () => ({
  customerRepository: {
    pipelineList: vi.fn(),
    listFiltered: vi.fn(),
    findByIco: vi.fn(),
    createForCompany: vi.fn(),
    updateForCompany: vi.fn(),
  },
}));
vi.mock("../../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));

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
      { id: "customer-1", companyName: "ITTEC, s.r.o.", status: "Prospect", label: "PROSPECT", salesOwner: "Martin", createdAt: new Date("2026-09-01T08:00:00.123Z") },
      { id: "customer-2", companyName: "RAVAK a.s.", status: "Active", label: "KEY ACCOUNT", salesOwner: "", createdAt: new Date("2026-08-01T08:00:00.000Z") },
    ]);
    await expect(customerService.pipelineList(COMPANY)).resolves.toEqual([
      { id: "customer-1", companyName: "ITTEC, s.r.o.", status: "Prospect", label: "PROSPECT", salesOwner: "Martin", createdAt: "2026-09-01T08:00:00.123Z" },
      { id: "customer-2", companyName: "RAVAK a.s.", status: "Active", label: "KEY ACCOUNT", salesOwner: "", createdAt: "2026-08-01T08:00:00.000Z" },
    ]);
    expect(repository.pipelineList).toHaveBeenCalledWith(COMPANY);
  });
});

describe("roles", () => {
  it("are passed on as a list filter, and every item carries its roles", async () => {
    repository.listFiltered.mockResolvedValue([customerRow({ roles: ["customer", "haulier"] })]);
    const [item] = await customerService.list(COMPANY, { role: "haulier" });
    expect(repository.listFiltered).toHaveBeenCalledWith(COMPANY, { role: "haulier" });
    expect(item!.roles).toEqual(["customer", "haulier"]);
  });

  it("make a new company a customer unless others are given", async () => {
    repository.findByIco.mockResolvedValue(null);
    ares.lookup.mockResolvedValue({ ico: "12345678", registrationDate: "" } as never);
    repository.createForCompany.mockResolvedValue(customerRow());
    await customerService.createFromAres(COMPANY, "12345678");
    expect(repository.createForCompany).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ roles: ["customer"] }));

    await customerService.createFromAres(COMPANY, "12345678", ["haulier"]);
    expect(repository.createForCompany).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ roles: ["haulier"] }));
  });

  it("are stored once each when changed", async () => {
    repository.updateForCompany.mockResolvedValue(customerRow({ roles: ["haulier", "customer"] }));
    await customerService.update("customer-1", COMPANY, { roles: ["haulier", "customer", "haulier"] });
    expect(repository.updateForCompany).toHaveBeenCalledWith("customer-1", COMPANY, { roles: ["haulier", "customer"] });
  });

  it("can't be emptied: a company is always at least a customer or a haulier", async () => {
    await expect(customerService.update("customer-1", COMPANY, { roles: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(customerService.createFromAres(COMPANY, "12345678", [])).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("stay as they are when a change does not send them", async () => {
    repository.updateForCompany.mockResolvedValue(customerRow());
    await customerService.update("customer-1", COMPANY, { salesOwner: "Martin" });
    expect(repository.updateForCompany).toHaveBeenCalledWith("customer-1", COMPANY, { salesOwner: "Martin" });
  });
});
