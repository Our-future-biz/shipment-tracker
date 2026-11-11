import { describe, expect, it } from "vitest";
import { registrationTermsForm } from "./registrationTerms";

describe("registrationTermsForm", () => {
  const stored = { termsName: "Obchodní podmínky", termsUrl: "https://example.cz/vop" };

  it("shows what is stored, with what the user changed on top", () => {
    expect(registrationTermsForm(stored, {})).toEqual({ ...stored, canSave: false });
    expect(registrationTermsForm(stored, { termsUrl: "https://example.cz/vop-2026" })).toEqual({
      termsName: "Obchodní podmínky",
      termsUrl: "https://example.cz/vop-2026",
      canSave: true,
    });
  });

  it("saves nothing before the stored terms are read: the blank name would replace the company's own", () => {
    const form = registrationTermsForm(undefined, { termsUrl: "https://example.cz/vop" });
    expect(form.termsName).toBe("");
    expect(form.canSave).toBe(false);
  });

  it("saves no terms without a web address", () => {
    expect(registrationTermsForm(stored, { termsUrl: "  " }).canSave).toBe(false);
  });
});
