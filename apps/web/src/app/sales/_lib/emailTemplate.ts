import { formatDate } from "@/lib/date";
import type { SalesQuoteData } from "./types";

// The Email dialog's templates: each user keeps their own (the server's /sales-email-templates),
// with placeholders that are filled in from the quote the dialog is for.

export interface EmailTemplateText {
  subject: string;
  message: string;
}

/** The placeholders a template can hold, with what each stands for. */
export const PLACEHOLDERS = [
  { key: "contact", label: "contact person (Sir/Madam without one)" },
  { key: "customer", label: "customer" },
  { key: "reference", label: "quote reference" },
  { key: "route", label: "origin → destination" },
  { key: "origin", label: "origin" },
  { key: "destination", label: "destination" },
  { key: "validUntil", label: "valid until" },
  { key: "sender", label: "sales owner" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];

/** The template every user has, also before they saved one: the message the dialog always started with. */
export const STANDARD_TEMPLATE: EmailTemplateText & { id: string; name: string } = {
  id: "standard",
  name: "Standard",
  subject: "Freight quotation {reference}",
  message: "Dear {contact},\n\nPlease find our quotation {reference} for your shipment {route}.\n\nBest regards,\n{sender}",
};

/** What each placeholder stands for on this quote. */
export function quoteValues(quoteNumber: string, data: SalesQuoteData, validUntil: string | null): Record<PlaceholderKey, string> {
  const origin = data.origin?.trim() ?? "";
  const destination = data.destination?.trim() ?? "";
  return {
    contact: data.customerContact?.trim() || "Sir/Madam",
    customer: data.customerName?.trim() ?? "",
    reference: quoteNumber,
    route: `${origin} → ${destination}`,
    origin,
    destination,
    validUntil: formatDate(validUntil),
    sender: data.salesOwner?.trim() || "Sales",
  };
}

/** The text with its placeholders filled in; a placeholder the dialog does not know stays as written. */
export function fillPlaceholders(text: string, values: Record<PlaceholderKey, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (Object.hasOwn(values, key) ? values[key as PlaceholderKey] : whole));
}

/**
 * A message written for this quote as a template: wherever it names this quote's contact,
 * reference, route and the rest, the placeholder takes their place, so the next quote gets its
 * own. The longest values go first (the route holds the origin); values too short to be told
 * from ordinary words are left as written.
 */
export function asTemplate(text: string, values: Record<PlaceholderKey, string>): string {
  const known = (Object.entries(values) as [PlaceholderKey, string][])
    .filter(([key, value]) => value.trim().length >= 3 && !(key === "route" && value.trim() === "→"))
    .sort((a, b) => b[1].length - a[1].length);
  let out = text;
  for (const [key, value] of known) out = out.split(value).join(`{${key}}`);
  return out;
}

/** The template's text for this quote. */
export function filledTemplate(template: EmailTemplateText, values: Record<PlaceholderKey, string>): EmailTemplateText {
  return { subject: fillPlaceholders(template.subject, values), message: fillPlaceholders(template.message, values) };
}
