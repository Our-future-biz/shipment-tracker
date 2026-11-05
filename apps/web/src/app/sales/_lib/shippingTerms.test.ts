import { describe, expect, it } from "vitest";
import { templateTerms, termsDifferFromTemplate, withTemplateTerms } from "./shippingTerms";

const TEMPLATES = [
  { name: "Standard", includes: "Ocean freight", excludes: "Duties", subjectTo: "Space" },
  { name: "Short", includes: "All in", excludes: "", subjectTo: "" },
];

describe("templateTerms", () => {
  it("puts the template's name and texts on the quote, an empty text as empty", () => {
    expect(templateTerms("Short", TEMPLATES)).toEqual({ shippingTerms: "Short", shippingIncludes: "All in", shippingExcludes: "", shippingSubjectTo: "" });
  });
});

describe("withTemplateTerms", () => {
  it("takes the template's texts as they are now, not the copied ones", () => {
    const copied = { customerName: "Alza", shippingTerms: "Standard", shippingIncludes: "typed by hand", shippingExcludes: "", shippingSubjectTo: "" };
    expect(withTemplateTerms(copied, TEMPLATES)).toEqual({ customerName: "Alza", ...templateTerms("Standard", TEMPLATES) });
  });

  it("leaves nothing chosen when the template is no longer kept", () => {
    const copied = { shippingTerms: "Gone", shippingIncludes: "old", shippingExcludes: "old", shippingSubjectTo: "old" };
    expect(withTemplateTerms(copied, TEMPLATES)).toEqual({ shippingTerms: "", shippingIncludes: "", shippingExcludes: "", shippingSubjectTo: "" });
  });

  it("changes nothing without the terms, or with none chosen", () => {
    expect(withTemplateTerms({ customerName: "Alza" }, TEMPLATES)).toEqual({ customerName: "Alza" });
    expect(withTemplateTerms({ shippingTerms: "", shippingIncludes: "" }, TEMPLATES)).toEqual({ shippingTerms: "", shippingIncludes: "" });
  });
});

describe("termsDifferFromTemplate", () => {
  it("is true once the template says something else, and false while it says the same", () => {
    const quote = { shippingTerms: "Standard", ...templateTerms("Standard", TEMPLATES) };
    expect(termsDifferFromTemplate(quote, TEMPLATES)).toBe(false);
    expect(termsDifferFromTemplate({ ...quote, shippingExcludes: "Duties, taxes" }, TEMPLATES)).toBe(true);
  });

  it("is false without a template, or for one no longer kept", () => {
    expect(termsDifferFromTemplate({ shippingIncludes: "x" }, TEMPLATES)).toBe(false);
    expect(termsDifferFromTemplate({ shippingTerms: "Gone", shippingIncludes: "x" }, TEMPLATES)).toBe(false);
  });
});
