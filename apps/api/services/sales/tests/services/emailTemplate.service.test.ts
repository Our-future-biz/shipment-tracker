import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against a stand-in for the repository.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/salesPreference.repository", () => ({
  salesPreferenceRepository: { get: vi.fn(), set: vi.fn() },
}));

import type { Actor } from "../../../../lib/rbac";
import { salesPreferenceRepository } from "../../repositories/salesPreference.repository";
import { emailTemplateService, templatesProblem, MAX_TEMPLATES } from "../../services/emailTemplate.service";
import { preferenceService } from "../../services/preference.service";

const repository = vi.mocked(salesPreferenceRepository);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const lukas: Actor = { userID: "user-1", companyID: COMPANY, role: "user" };
const template = (name: string, over = {}) => ({ id: `id-${name}`, name, subject: "Freight quotation {reference}", message: "Dear {contact},", ...over });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("list", () => {
  it("reads the user's own templates, under a key of theirs, leaving out what is not a template", async () => {
    repository.get.mockResolvedValue([template("Standard"), { name: "broken" }, "x"]);
    await expect(emailTemplateService.list(lukas)).resolves.toEqual([template("Standard")]);
    expect(repository.get).toHaveBeenCalledWith("email_templates:user-1", COMPANY);
  });

  it("is empty for a user who saved none", async () => {
    repository.get.mockResolvedValue(null);
    await expect(emailTemplateService.list(lukas)).resolves.toEqual([]);
  });
});

describe("save", () => {
  it("stores the list whole under the user's key, the names trimmed", async () => {
    const saved = await emailTemplateService.save(lukas, [template(" Standard "), template("German")]);
    expect(saved.map((t) => t.name)).toEqual(["Standard", "German"]);
    expect(repository.set).toHaveBeenCalledWith("email_templates:user-1", COMPANY, saved);
  });

  it("refuses a list it cannot keep", async () => {
    await expect(emailTemplateService.save(lukas, [template("A"), template("a")])).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.set).not.toHaveBeenCalled();
  });
});

describe("templatesProblem", () => {
  it("names what is wrong", () => {
    expect(templatesProblem([template("Standard")])).toBeNull();
    expect(templatesProblem([])).toBeNull();
    expect(templatesProblem("x")).toMatch(/list/);
    expect(templatesProblem([template("  ")])).toMatch(/name/);
    expect(templatesProblem([template("A"), template("a", { id: "2" })])).toMatch(/two templates named/);
    expect(templatesProblem([template("A", { message: "x".repeat(5001) })])).toMatch(/message/);
    expect(templatesProblem(Array.from({ length: MAX_TEMPLATES + 1 }, (_, i) => template(`T${i}`)))).toMatch(/at most/);
  });
});

describe("the shared preferences", () => {
  it("do not give a user's templates to anybody", async () => {
    await expect(preferenceService.get("email_templates:user-1", COMPANY)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.get).not.toHaveBeenCalled();
  });
});
