import { z } from "zod";
import { APIError } from "encore.dev/api";
import type { RailLayout } from "../interfaces/interfaces";

// The layout of a rail tariff's sheet, checked the same way whether the AI proposed it or a user
// corrected it: letters upper case, dates real, lengths and weights sensible. Pure.

export const letter = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,3}$/, "must be a column letter, e.g. C");

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "is not a real date");

const band = z
  .object({
    column: letter,
    label: z.string().trim().min(1).max(100),
    minLengthFt: z.number().positive().max(60),
    maxLengthFt: z.number().positive().max(60),
    maxGrossTonnes: z.number().positive().max(100).nullable(),
  })
  .refine((b) => b.minLengthFt <= b.maxLengthFt, "the shortest length is longer than the longest");

const optionalLetter = letter.nullable();

/** The web links of a tariff, with a label each. */
export const linkList = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(200),
      url: z
        .string()
        .trim()
        .url()
        .refine((u) => /^https?:\/\//i.test(u), "must be a web link"),
    }),
  )
  .max(10);

const layoutSchema = z
  .object({
    sheet: z.string().min(1),
    headerRow: z.number().int().min(1),
    firstDataRow: z.number().int().min(1),
    lastDataRow: z.number().int().min(1).nullable(),
    columns: z.object({
      country: optionalLetter,
      postcode: optionalLetter,
      place: letter,
      region: optionalLetter,
      via: optionalLetter,
      emptyDepot: optionalLetter,
      note: optionalLetter,
      validFrom: optionalLetter,
      validTo: optionalLetter,
    }),
    bands: z.array(band).max(40),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "must be a currency code, e.g. EUR"),
    validFrom: isoDate.nullable(),
    validTo: isoDate.nullable(),
    defaultCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "must be a country code, e.g. CZ"),
    conditions: z.array(z.string().trim().min(1).max(500)).max(30),
    links: linkList,
    name: z.string().trim().min(1).max(200),
  })
  .refine((l) => l.firstDataRow > l.headerRow, { message: "the first price row must come after the headings row", path: ["firstDataRow"] })
  .refine((l) => l.lastDataRow === null || l.lastDataRow >= l.firstDataRow, { message: "the last price row comes before the first", path: ["lastDataRow"] })
  .refine((l) => !l.validFrom || !l.validTo || l.validTo >= l.validFrom, { message: "the validity ends before it starts", path: ["validTo"] })
  .refine((l) => new Set(l.bands.map((b) => b.column)).size === l.bands.length, { message: "a price column is listed twice", path: ["bands"] });

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** An AI's links made fit for checking: mail links dropped, "www." ones given https://, at most 10. */
export function tidyLinks(input: unknown): { label: string; url: string }[] {
  return asArray(input)
    .filter(isRecord)
    .map((l) => ({ label: String(l.label ?? "").trim() || "Link", url: String(l.url ?? "").trim() }))
    .map((l) => (/^www\./i.test(l.url) ? { ...l, url: `https://${l.url}` } : l))
    .filter((l) => /^https?:\/\/[^\s]+$/i.test(l.url))
    .slice(0, 10);
}

/** An AI's terms made fit for checking: empty lines dropped, at most 30 of at most 500 characters. */
export function tidyConditions(input: unknown): string[] {
  return asArray(input)
    .map((c) => String(c ?? "").trim())
    .filter(Boolean)
    .map((c) => c.slice(0, 500))
    .slice(0, 30);
}

/**
 * The AI's answer made fit for checking where it only falls short in small things, so a mail link
 * in the sheet or one long remark does not refuse the whole upload: links that are no web links are
 * dropped ("www." ones get https://), conditions and price columns are cut to their limits, a missing last price row means the end of the sheet, and a missing
 * country is Czechia. What it says about columns, rows, dates and prices is left as it is.
 */
export function tidyAiLayout(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const links = tidyLinks(input.links);
  const conditions = tidyConditions(input.conditions);
  const country = String(input.defaultCountry ?? "").trim();
  const name = String(input.name ?? "").trim();
  return {
    ...input,
    lastDataRow: input.lastDataRow ?? null,
    bands: asArray(input.bands).slice(0, 40),
    links,
    conditions,
    defaultCountry: /^[A-Za-z]{2}$/.test(country) ? country : "CZ",
    name: (name || "Rail tariff").slice(0, 200),
  };
}

/** A layout as checked and tidied; one that does not hold is refused with the first problem found. */
export function parseRailLayout(input: unknown): RailLayout {
  const parsed = layoutSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0]!;
  const where = issue.path.join(".");
  throw APIError.invalidArgument(`The tariff layout is not usable: ${where ? `${where} ` : ""}${issue.message}`);
}

/** Whether `layout` can be read from the file's sheets at all: its sheet is there and long enough. */
export function layoutProblem(layout: RailLayout, sheets: { name: string; rowCount: number }[]): string | null {
  const sheet = sheets.find((s) => s.name === layout.sheet);
  if (!sheet) return `The file has no sheet "${layout.sheet}"`;
  if (layout.firstDataRow > sheet.rowCount) return `Sheet "${layout.sheet}" has only ${sheet.rowCount} rows`;
  return null;
}
