import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  count: vi.fn(),
  insertMissing: vi.fn(),
  listAll: vi.fn(),
  findByNameInsensitive: vi.fn(),
  createForCompany: vi.fn(),
  updateForCompany: vi.fn(),
  softDeleteForCompany: vi.fn(),
  getByIdForCompany: vi.fn(),
}));
vi.mock("../repositories/termsCondition.repository", () => ({ termsConditionRepository: repo }));
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    invalidArgument: (msg: string) => new Error(msg),
    alreadyExists: (msg: string) => new Error(msg),
  },
}));

import { termsService } from "../services/terms.service";

const COMPANY = "c";
const row = (over: Record<string, unknown> = {}) => ({
  id: "t1", name: "AIR IMPORT", includes: "", excludes: "", companyId: COMPANY,
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("termsService", () => {
  it("seeds the default templates once, for a company that has none", async () => {
    repo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(6);
    repo.listAll.mockResolvedValue([]);
    await termsService.list(COMPANY);
    await termsService.list(COMPANY);
    expect(repo.insertMissing).toHaveBeenCalledTimes(1);
    expect(repo.insertMissing.mock.calls[0]![1]).toHaveLength(6);
  });

  it("refuses a name another template already has, in any case", async () => {
    repo.findByNameInsensitive.mockResolvedValue(row({ id: "other" }));
    await expect(termsService.create(COMPANY, " air import ")).rejects.toThrow("already exists");
    await expect(termsService.update("t1", COMPANY, { name: "Air Import" })).rejects.toThrow("already exists");
  });

  it("lets a template keep its own name", async () => {
    repo.findByNameInsensitive.mockResolvedValue(row({ id: "t1" }));
    repo.updateForCompany.mockResolvedValue(row({ includes: "THC" }));
    await expect(termsService.update("t1", COMPANY, { name: "AIR IMPORT", includes: "THC" })).resolves.toMatchObject({ includes: "THC" });
  });

  it("reports a missing template on delete", async () => {
    repo.softDeleteForCompany.mockResolvedValue(null);
    await expect(termsService.softDelete("x", COMPANY)).rejects.toThrow("not found");
  });
});
