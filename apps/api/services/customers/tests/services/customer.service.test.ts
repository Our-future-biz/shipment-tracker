import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against a stand-in for the repository.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../db/db", () => ({ db: {} }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: { pipelineList: vi.fn(), getByIdForCompany: vi.fn(), updateForCompany: vi.fn() } }));

import { customerRepository } from "../../repositories/customer.repository";
import { customerService } from "../../services/customer.service";

const repository = vi.mocked(customerRepository);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

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

describe("activate", () => {
  const row = (status: string) => ({ id: "customer-1", status }) as never;

  it("makes a Prospect or Inactive customer Active", async () => {
    for (const status of ["Prospect", "Inactive"]) {
      repository.getByIdForCompany.mockResolvedValue(row(status));
      repository.updateForCompany.mockResolvedValue(row("Active"));
      await expect(customerService.activate("customer-1", COMPANY)).resolves.toBe(true);
    }
    expect(repository.updateForCompany).toHaveBeenCalledWith("customer-1", COMPANY, { status: "Active" });
  });

  it("writes nothing for an Active customer or one that no longer exists", async () => {
    repository.getByIdForCompany.mockResolvedValueOnce(row("Active")).mockResolvedValueOnce(null);
    await expect(customerService.activate("customer-1", COMPANY)).resolves.toBe(false);
    await expect(customerService.activate("customer-1", COMPANY)).resolves.toBe(false);
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });
});
