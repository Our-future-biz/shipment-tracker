import { describe, expect, it } from "vitest";
import { renamedCompany } from "./companyName";

describe("a company renamed on its page", () => {
  it("is saved trimmed", () => {
    expect(renamedCompany("  Alfa Group s.r.o. ")).toBe("Alfa Group s.r.o.");
  });

  it("is not saved when nothing is left of the name", () => {
    expect(renamedCompany("")).toBeNull();
    expect(renamedCompany("   ")).toBeNull();
  });
});
