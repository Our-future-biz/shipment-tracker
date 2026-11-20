import { describe, expect, it } from "vitest";
import { fittingTemplate, templateTerms, termsDifferFromTemplate, withTemplateTerms } from "./shippingTerms";

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

describe("fittingTemplate (User Council S19)", () => {
  const named = (...names: string[]) => names.map((name) => ({ name, includes: "", excludes: "", subjectTo: "" }));

  it("is the one template whose name names the quote's freight mode and its direction or none", () => {
    const templates = named("FCL EXPORT", "FCL IMPORT", "LCL", "Air export", "Standard");
    expect(fittingTemplate({ serviceType: "Sea FCL", direction: "Export" }, templates)).toBe("FCL EXPORT");
    expect(fittingTemplate({ serviceType: "Sea LCL", direction: "Import" }, templates)).toBe("LCL");
    expect(fittingTemplate({ serviceType: "Air", direction: "Export" }, templates)).toBe("Air export");
  });

  it("is none with several or none that fit, or before the freight mode is known", () => {
    const templates = named("FCL EXPORT", "FCL IMPORT", "FCL Export Asia", "Repair terms");
    expect(fittingTemplate({ serviceType: "Sea FCL", direction: "Export" }, templates)).toBeNull();
    expect(fittingTemplate({ serviceType: "Sea FCL" }, named("FCL EXPORT", "FCL IMPORT"))).toBeNull();
    expect(fittingTemplate({ serviceType: "Air", direction: "Import" }, templates)).toBeNull();
    expect(fittingTemplate({ direction: "Export" }, templates)).toBeNull();
  });
});
