import { z } from "zod";
import { APIError } from "encore.dev/api";
import { isRealYmd } from "../../../lib/businessDate";

// The pieces every kind of tariff layout is checked with, whether the AI proposed it or a user
// corrected it - column letters, rows, sheets, dates, codes, links and terms - and how the AI's
// answer is tidied where it only falls short in small things. Pure.

export const letter = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,3}$/, "must be a column letter, e.g. C");

/** A 1-based sheet row; Excel has at most 1,048,576. */
export const rowNumber = z.number().int().min(1).max(1_048_576);

/** A sheet's name as the file has it (Excel allows 31 characters; a CSV file's sheet is named after the file). */
export const sheetName = z.string().min(1).max(200);

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date YYYY-MM-DD")
  .refine(isRealYmd, "is not a real date");

export const countryCode = (example: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, `must be a country code, e.g. ${example}`);

export const currencyCode = (example: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, `must be a currency code, e.g. ${example}`);

/** The web links of a tariff, with a label each. */
export const linkList = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(200),
      url: z
        .string()
        .trim()
        .max(2000)
        .url()
        .refine((u) => /^https?:\/\//i.test(u), "must be a web link"),
    }),
  )
  .max(10);

/** What the prices include and the tariff's terms, one line each. */
export const conditionList = (max: number) => z.array(z.string().trim().min(1).max(500)).max(max);

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** An AI's links made fit for checking: mail links dropped, "www." ones given https://, at most 10. */
export function tidyLinks(input: unknown): { label: string; url: string }[] {
  return asArray(input)
    .filter(isRecord)
    .map((l) => ({ label: String(l.label ?? "").trim().slice(0, 200) || "Link", url: String(l.url ?? "").trim() }))
    .map((l) => (/^www\./i.test(l.url) ? { ...l, url: `https://${l.url}` } : l))
    .filter((l) => /^https?:\/\/[^\s]+$/i.test(l.url) && l.url.length <= 2000)
    .slice(0, 10);
}

/** An AI's terms made fit for checking: empty lines dropped, at most `max` of at most 500 characters. */
export function tidyConditions(input: unknown, max = 30): string[] {
  return asArray(input)
    .map((c) => String(c ?? "").trim())
    .filter(Boolean)
    .map((c) => c.slice(0, 500))
    .slice(0, max);
}

/** A layout as checked and tidied by its schema; one that does not hold is refused with the first problem found. */
export function parseLayout<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0]!;
  const where = issue.path.join(".");
  throw APIError.invalidArgument(`The tariff layout is not usable: ${where ? `${where} ` : ""}${issue.message}`);
}
