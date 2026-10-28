import { z } from "zod";
import type { RailLayout } from "../interfaces/interfaces";
import { asArray, conditionList, countryCode, currencyCode, isRecord, isoDate, letter, linkList, parseLayout, rowNumber, sheetName, tidyConditions, tidyLinks } from "./layoutSchema";

// The layout of a rail tariff's sheet, checked the same way whether the AI proposed it or a user
// corrected it: letters upper case, dates real, lengths and weights sensible. Pure.

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

const layoutSchema = z
  .object({
    sheet: sheetName,
    headerRow: rowNumber,
    firstDataRow: rowNumber,
    lastDataRow: rowNumber.nullable(),
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
    currency: currencyCode("EUR"),
    validFrom: isoDate.nullable(),
    validTo: isoDate.nullable(),
    defaultCountry: countryCode("CZ"),
    conditions: conditionList(30),
    links: linkList,
    name: z.string().trim().min(1).max(200),
  })
  .refine((l) => l.firstDataRow > l.headerRow, { message: "the first price row must come after the headings row", path: ["firstDataRow"] })
  .refine((l) => l.lastDataRow === null || l.lastDataRow >= l.firstDataRow, { message: "the last price row comes before the first", path: ["lastDataRow"] })
  .refine((l) => !l.validFrom || !l.validTo || l.validTo >= l.validFrom, { message: "the validity ends before it starts", path: ["validTo"] })
  .refine((l) => new Set(l.bands.map((b) => b.column)).size === l.bands.length, { message: "a price column is listed twice", path: ["bands"] });

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
  return parseLayout(layoutSchema, input);
}

/** Whether `layout` can be read from the file's sheets at all: its sheet is there and long enough. */
export function layoutProblem(layout: RailLayout, sheets: { name: string; rowCount: number }[]): string | null {
  const sheet = sheets.find((s) => s.name === layout.sheet);
  if (!sheet) return `The file has no sheet "${layout.sheet}"`;
  if (layout.firstDataRow > sheet.rowCount) return `Sheet "${layout.sheet}" has only ${sheet.rowCount} rows`;
  return null;
}
