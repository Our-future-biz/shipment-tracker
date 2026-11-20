import type { SalesQuoteData } from "./types";

// A quote's Shipping terms are a Terms & Conditions template's (Sales Settings), word for word: its
// name and its three texts. They are never typed on the quote, so wherever they reach a quote other
// than by choosing the template - copied from another quote, or a template changed since - they
// are read from the template again.

/** A Terms & Conditions template as the Shipping terms step reads it. */
export interface TermsTemplate {
  name: string;
  includes: string;
  excludes: string;
  subjectTo: string;
}

export type ShippingTerms = Pick<SalesQuoteData, "shippingTerms" | "shippingIncludes" | "shippingExcludes" | "shippingSubjectTo">;

/** What choosing a template puts on the quote: its name, and its texts as they are (a text it leaves empty is empty). */
export function templateTerms(name: string, templates: readonly TermsTemplate[]): ShippingTerms {
  const template = templates.find((t) => t.name === name);
  return {
    shippingTerms: name,
    shippingIncludes: template?.includes ?? "",
    shippingExcludes: template?.excludes ?? "",
    shippingSubjectTo: template?.subjectTo ?? "",
  };
}

/**
 * Shipping terms copied from another quote (Copy from, Duplicate): the template's texts as they are
 * now, not the ones the other quote was given - an older quote may hold texts typed by hand under the
 * name. A template no longer kept leaves nothing chosen, to be chosen again before the quote is sent.
 * A patch without the terms is as it was.
 */
export function withTemplateTerms<T extends Partial<SalesQuoteData>>(patch: T, templates: readonly TermsTemplate[]): T {
  if (!("shippingTerms" in patch)) return patch;
  const name = patch.shippingTerms?.trim() ?? "";
  if (!name) return patch;
  if (!templates.some((t) => t.name === name)) {
    return { ...patch, shippingTerms: "", shippingIncludes: "", shippingExcludes: "", shippingSubjectTo: "" };
  }
  return { ...patch, ...templateTerms(name, templates) };
}

/** Whether a quote's texts are not (any more) its template's: it was changed since they were put on, or they were copied. */
export function termsDifferFromTemplate(data: SalesQuoteData, templates: readonly TermsTemplate[]): boolean {
  const name = data.shippingTerms?.trim();
  const template = name ? templates.find((t) => t.name === name) : undefined;
  if (!template) return false;
  const now = templateTerms(template.name, templates);
  return (
    (data.shippingIncludes ?? "") !== now.shippingIncludes ||
    (data.shippingExcludes ?? "") !== now.shippingExcludes ||
    (data.shippingSubjectTo ?? "") !== now.shippingSubjectTo
  );
}

// The words a template's name gives its freight mode by ("FCL EXPORT", "Air import"). Templates
// have a name and their texts only, so the name is all that says which quotes one is for.
const MODE_WORDS: Record<string, RegExp> = {
  "Sea FCL": /\bFCL\b/i,
  "Sea LCL": /\bLCL\b/i,
  "Sea Break Bulk": /\bbreak[\s-]?bulk\b|\bBB\b/i,
  Air: /\bair\b/i,
  Rail: /\brail\b/i,
  Road: /\broad\b|\btruck/i,
};
const DIRECTION_WORDS: Record<string, RegExp> = { Export: /\bexport\b/i, Import: /\bimport\b/i };

/**
 * The template made for the quote's freight mode, where there is exactly one: its name names the
 * mode, and the quote's direction or none ("FCL EXPORT" for a Sea FCL export). Chosen for a quote
 * with no Shipping terms yet (User Council S19), so the usual template need not be looked for;
 * null with none or several that fit, or before the freight mode is known - then one is picked.
 */
export function fittingTemplate(data: Pick<SalesQuoteData, "serviceType" | "direction">, templates: readonly TermsTemplate[]): string | null {
  const mode = data.serviceType ? MODE_WORDS[data.serviceType] : undefined;
  if (!mode) return null;
  const otherDirections = Object.entries(DIRECTION_WORDS).filter(([direction]) => direction !== data.direction);
  const fitting = templates.filter((t) => mode.test(t.name) && (!data.direction || !otherDirections.some(([, words]) => words.test(t.name))));
  return fitting.length === 1 ? fitting[0]!.name : null;
}
