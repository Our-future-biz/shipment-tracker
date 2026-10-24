import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real, with the policy it asks, against a stand-in for the repository.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/termsCondition.repository", () => ({
  termsConditionRepository: {
    countEver: vi.fn(),
    seed: vi.fn(),
    listAll: vi.fn(),
    getByIdForCompany: vi.fn(),
    findByNameInsensitive: vi.fn(),
    createForCompany: vi.fn(),
    updateForCompany: vi.fn(),
    updateIfUnchanged: vi.fn(),
    softDeleteForCompany: vi.fn(),
  },
}));

import type { Actor } from "../../../../lib/rbac";
import { termsConditionRepository } from "../../repositories/termsCondition.repository";
import { termsService } from "../../services/terms.service";

const repository = vi.mocked(termsConditionRepository);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ID = "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11";
const OTHER_ID = "5c1d3b5e-0c58-4a57-8e0b-3a1f4d2e9b10";
const actor = (role: string): Actor => ({ userID: "user-1", companyID: COMPANY, role });
const user = actor("user");
const manager = actor("manager");
const EDITORS = ["superadmin", "admin", "manager"];
const refused = { code: "permission_denied", message: "only managers and admins can change this" };
const CREATED = new Date("2026-10-01T08:00:00.000Z");
const template = { id: ID, name: "AIR IMPORT", includes: "", excludes: "", subjectTo: "", createdAt: CREATED, updatedAt: CREATED };
// The template as the service hands it out: times as ISO strings, nothing else of the row.
const templateItem = { ...template, createdAt: CREATED.toISOString(), updatedAt: CREATED.toISOString() };
const notFound = { code: "not_found", message: "Terms & conditions not found" };
const NAME_TAKEN = { code: "already_exists", message: "A terms & conditions template with this name already exists" };

beforeEach(() => {
  vi.resetAllMocks();
  repository.countEver.mockResolvedValue(6);
  // No template of that name yet.
  repository.findByNameInsensitive.mockResolvedValue(null as never);
  // A write that finds the template answers with it.
  repository.updateForCompany.mockResolvedValue(template as never);
  repository.softDeleteForCompany.mockResolvedValue(template as never);
});

describe("reading", () => {
  it("is open to everybody", async () => {
    repository.listAll.mockResolvedValue([template] as never);
    await expect(termsService.list(COMPANY)).resolves.toEqual([templateItem]);
    expect(repository.listAll).toHaveBeenCalledWith(COMPANY);
    expect(repository.seed).not.toHaveBeenCalled();
  });

  it("still gives a company its default templates on first use, whoever opens the list", async () => {
    // The company never had a template, deleted ones included.
    repository.countEver.mockResolvedValue(0);
    repository.listAll.mockResolvedValue([]);
    await termsService.list(COMPANY);
    expect(repository.seed).toHaveBeenCalledTimes(1);
    expect(repository.seed).toHaveBeenCalledWith(COMPANY, ["AIR IMPORT", "AIR EXPORT", "FCL IMPORT", "FCL EXPORT", "LCL IMPORT", "LCL EXPORT"]);
  });

  it("all templates deleted stays empty: the defaults do not come back", async () => {
    // Six templates the company once had, none of them live any more.
    repository.countEver.mockResolvedValue(6);
    repository.listAll.mockResolvedValue([]);
    await expect(termsService.list(COMPANY)).resolves.toEqual([]);
    expect(repository.countEver).toHaveBeenCalledWith(COMPANY);
    expect(repository.seed).not.toHaveBeenCalled();
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });
});

describe("create", () => {
  it("creates a template for who may edit the Sales settings, under the trimmed name", async () => {
    for (const role of EDITORS) {
      repository.createForCompany.mockClear();
      repository.createForCompany.mockResolvedValue(template as never);
      await expect(termsService.create(actor(role), "  AIR IMPORT "), role).resolves.toEqual(templateItem);
      expect(repository.createForCompany).toHaveBeenCalledWith(COMPANY, { name: "AIR IMPORT", includes: "", excludes: "", subjectTo: "" });
    }
  });

  it("refuses a plain user before anything is read or written", async () => {
    await expect(termsService.create(user, "AIR IMPORT")).rejects.toMatchObject(refused);
    // Also what would otherwise be told about the name: whether it is taken, or empty.
    await expect(termsService.create(user, "")).rejects.toMatchObject(refused);
    expect(repository.findByNameInsensitive).not.toHaveBeenCalled();
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("keeps its own refusals for an editor: a name that is empty, a name that exists", async () => {
    await expect(termsService.create(actor("manager"), "   ")).rejects.toMatchObject({ code: "invalid_argument", message: "name is required" });
    repository.findByNameInsensitive.mockResolvedValue(template as never);
    await expect(termsService.create(actor("manager"), "air import")).rejects.toMatchObject(NAME_TAKEN);
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  it("writes the fields that were sent, for who may edit the Sales settings", async () => {
    for (const role of EDITORS) {
      repository.updateForCompany.mockClear();
      repository.updateForCompany.mockResolvedValue({ ...template, includes: "Freight" } as never);
      await expect(termsService.update(ID, actor(role), { includes: "Freight" }), role).resolves.toMatchObject({ includes: "Freight" });
      expect(repository.updateForCompany).toHaveBeenCalledWith(ID, COMPANY, { includes: "Freight" });
    }
  });

  it("refuses a plain user and writes nothing", async () => {
    await expect(termsService.update(ID, user, { name: "MINE", includes: "x", excludes: "y" })).rejects.toMatchObject(refused);
    // Also what would otherwise be told about the name, or about somebody else's save.
    await expect(termsService.update(ID, user, { name: "", expectedUpdatedAt: "2026-10-12T08:00:00.000Z" })).rejects.toMatchObject(refused);
    expect(repository.findByNameInsensitive).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
  });

  it("stores a new name trimmed", async () => {
    await termsService.update(ID, manager, { name: "  AIR IMPORT 2026 " });
    expect(repository.findByNameInsensitive).toHaveBeenCalledWith("AIR IMPORT 2026", COMPANY);
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, COMPANY, { name: "AIR IMPORT 2026" });
  });

  it("refuses a rename to an empty name and writes nothing", async () => {
    for (const name of ["", "   ", "\n\t"]) {
      await expect(termsService.update(ID, manager, { name, includes: "Freight" }), JSON.stringify(name)).rejects.toMatchObject({
        code: "invalid_argument",
        message: "name is required",
      });
    }
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("refuses a rename to a name another template has, in whatever capitals, and writes nothing", async () => {
    // The lookup is by the name whatever its capitals (findByNameInsensitive): it finds another template.
    repository.findByNameInsensitive.mockResolvedValue({ ...template, id: OTHER_ID, name: "AIR EXPORT" } as never);
    for (const name of ["AIR EXPORT", "air export", " Air Export "]) {
      await expect(termsService.update(ID, manager, { name }), name).rejects.toMatchObject(NAME_TAKEN);
    }
    expect(repository.findByNameInsensitive).toHaveBeenLastCalledWith("Air Export", COMPANY);
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("lets a template keep its own name, also in other capitals", async () => {
    repository.findByNameInsensitive.mockResolvedValue(template as never);
    await termsService.update(ID, manager, { name: "AIR IMPORT", excludes: "Duties" });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, COMPANY, { name: "AIR IMPORT", excludes: "Duties" });
    await termsService.update(ID, manager, { subjectTo: "Space and equipment availability" });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, COMPANY, { subjectTo: "Space and equipment availability" });
    await termsService.update(ID, manager, { name: "Air Import" });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, COMPANY, { name: "Air Import" });
    // The same template, its id written in capitals.
    await termsService.update(ID.toUpperCase(), manager, { name: "AIR IMPORT" });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID.toUpperCase(), COMPANY, { name: "AIR IMPORT" });
  });

  it("does not look at names when none is sent", async () => {
    await termsService.update(ID, manager, { includes: "Freight" });
    expect(repository.findByNameInsensitive).not.toHaveBeenCalled();
  });

  it("is not found for a template the company does not have", async () => {
    repository.updateForCompany.mockResolvedValue(null);
    await expect(termsService.update(ID, manager, { includes: "Freight" })).rejects.toMatchObject(notFound);
  });
});

// The repository stands in as one stored template whose version is its updatedAt: it writes a
// change made on that version - compared in milliseconds, as the real one compares - and stamps
// the moment of the write.
describe("update with the version the change was made on", () => {
  let stored: { id: string; name: string; includes: string; excludes: string; createdAt: Date; updatedAt: Date } | null;
  let now: number;

  beforeEach(() => {
    stored = { ...template, updatedAt: new Date("2026-10-12T08:00:00.000Z") };
    now = Date.parse("2026-10-12T09:00:00.000Z");
    repository.updateIfUnchanged.mockImplementation(async (id, companyId, data, expectedUpdatedAt) => {
      if (!stored || id !== stored.id || companyId !== COMPANY || stored.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return null;
      now += 1000;
      stored = { ...stored, ...(data as object), updatedAt: new Date(now) };
      return stored as never;
    });
    repository.getByIdForCompany.mockImplementation(async () => stored as never);
  });

  it("writes a save made on the current version and returns a newer one", async () => {
    const saved = await termsService.update(ID, manager, { includes: "Freight", expectedUpdatedAt: "2026-10-12T08:00:00.000Z" });
    expect(saved).toMatchObject({ includes: "Freight" });
    expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse("2026-10-12T08:00:00.000Z"));
    expect(repository.updateIfUnchanged).toHaveBeenCalledWith(ID, COMPANY, { includes: "Freight" }, new Date("2026-10-12T08:00:00.000Z"));
    // The unconditional write is not used for it.
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("refuses a save made on an older version with 'aborted' and writes nothing", async () => {
    await termsService.update(ID, manager, { includes: "Hers", expectedUpdatedAt: "2026-10-12T08:00:00.000Z" });
    await expect(termsService.update(ID, manager, { includes: "His", expectedUpdatedAt: "2026-10-12T08:00:00.000Z" })).rejects.toMatchObject({
      code: "aborted",
      message: "the template was changed by someone else - load the latest version",
    });
    expect(stored).toMatchObject({ includes: "Hers" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("never refuses one editor's saves in a row: each is made on the version the save before it returned", async () => {
    let version = "2026-10-12T08:00:00.000Z";
    for (let i = 1; i <= 10; i++) {
      const saved = await termsService.update(ID, manager, { includes: `Freight ${i}`, expectedUpdatedAt: version });
      version = saved.updatedAt;
    }
    expect(stored).toMatchObject({ includes: "Freight 10" });
  });

  it("writes a save that names no version whatever is stored, as before", async () => {
    repository.updateForCompany.mockResolvedValue({ ...template, includes: "Freight" } as never);
    await expect(termsService.update(ID, manager, { includes: "Freight" })).resolves.toMatchObject({ includes: "Freight" });
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, COMPANY, { includes: "Freight" });
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
  });

  it("is not found - not a conflict - when the template is gone", async () => {
    stored = null;
    await expect(termsService.update(ID, manager, { includes: "Freight", expectedUpdatedAt: "2026-10-12T08:00:00.000Z" })).rejects.toMatchObject(notFound);
    expect(repository.getByIdForCompany).toHaveBeenCalledWith(ID, COMPANY);
  });

  it("refuses a version that is no time and writes nothing", async () => {
    await expect(termsService.update(ID, manager, { includes: "Freight", expectedUpdatedAt: "yesterday" })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "expectedUpdatedAt is not a time",
    });
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("checks the new name before the version: a taken name is told as such", async () => {
    repository.findByNameInsensitive.mockResolvedValue({ ...template, id: OTHER_ID, name: "AIR EXPORT" } as never);
    await expect(termsService.update(ID, manager, { name: "AIR EXPORT", expectedUpdatedAt: "2026-10-12T08:00:00.000Z" })).rejects.toMatchObject(NAME_TAKEN);
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
  });
});

describe("softDelete", () => {
  it("deletes a template for who may edit the Sales settings", async () => {
    for (const role of EDITORS) {
      repository.softDeleteForCompany.mockClear();
      await termsService.softDelete(ID, actor(role));
      expect(repository.softDeleteForCompany, role).toHaveBeenCalledWith(ID, COMPANY);
    }
  });

  it("is not found for a template the company does not have", async () => {
    repository.softDeleteForCompany.mockResolvedValue(null);
    await expect(termsService.softDelete(ID, manager)).rejects.toMatchObject(notFound);
  });

  it("refuses a plain user and deletes nothing", async () => {
    await expect(termsService.softDelete(ID, user)).rejects.toMatchObject(refused);
    expect(repository.softDeleteForCompany).not.toHaveBeenCalled();
  });
});
