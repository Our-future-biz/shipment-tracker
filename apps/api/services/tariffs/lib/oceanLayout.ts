import { z } from "zod";
import { APIError } from "encore.dev/api";
import type { OceanLayout } from "../interfaces/interfaces";
import { asArray, isRecord, isoDate, letter, linkList, tidyConditions, tidyLinks } from "./railLayout";

// The layout of a shipping line's tariff file, checked the same way whether the AI proposed it or a
// user corrected it: letters and codes upper case, dates real, every table with its ports and a
// currency, each surcharge with its basis and the tables it belongs to. Pure.

const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "must be a country code, e.g. CN");

const locode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}[A-Z0-9]{3}$/, "must be a UN/LOCODE, e.g. DEHAM");

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "must be a currency code, e.g. USD");

const equipment = z.enum(["20DC", "40DC", "40HC", "20RF", "40RF"]);

const table = z
  .object({
    label: z.string().trim().min(1).max(100),
    sheet: z.string().min(1),
    headerRow: z.number().int().min(1),
    firstDataRow: z.number().int().min(1),
    lastDataRow: z.number().int().min(1).nullable(),
    pol: letter.nullable(),
    polFixed: z.string().trim().min(1).max(500).nullable(),
    pod: letter,
    via: letter.nullable(),
    currency: letter.nullable(),
    currencyFixed: currency.nullable(),
    prices: z.array(z.object({ column: letter, equipment, label: z.string().trim().min(1).max(100) })).min(1).max(10),
    note: letter.nullable(),
    podCountries: z.array(country).max(60),
  })
  .refine((t) => t.firstDataRow > t.headerRow, { message: "the first rate row must come after the headings row", path: ["firstDataRow"] })
  .refine((t) => t.lastDataRow === null || t.lastDataRow >= t.firstDataRow, { message: "the last rate row comes before the first", path: ["lastDataRow"] })
  .refine((t) => t.pol !== null || t.polFixed !== null, { message: "say which column holds the ports of loading, or what they are", path: ["pol"] })
  .refine((t) => t.currency !== null || t.currencyFixed !== null, { message: "say which column holds the currency, or what it is", path: ["currency"] })
  .refine((t) => new Set(t.prices.map((p) => p.column)).size === t.prices.length, { message: "a price column is listed twice", path: ["prices"] })
  .refine((t) => new Set(t.prices.map((p) => p.equipment)).size === t.prices.length, { message: "two price columns are for the same container", path: ["prices"] });

const surcharge = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(20),
  amount: z.number().min(0).max(1_000_000),
  currency,
  basis: z.enum(["teu", "container", "bl", "booking"]),
  equipment: z.array(z.enum(["dry", "reefer"])).max(2),
  tables: z.array(z.number().int().min(0)).max(40),
  countries: z.array(country).max(80),
  exceptCountries: z.array(country).max(80),
  ports: z.array(locode).max(80),
  exceptPorts: z.array(locode).max(80),
  condition: z.enum(["always", "dangerous", "manual_booking"]),
  charge: z.enum(["fcl_baf", "ams_ens", "fcl_documentation", "other"]),
});

const layoutSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    validFrom: isoDate.nullable(),
    validTo: isoDate.nullable(),
    tables: z.array(table).min(1).max(40),
    portCodes: z.record(z.string().trim().min(1).max(100), locode),
    surcharges: z.array(surcharge).max(60),
    conditions: z.array(z.string().trim().min(1).max(500)).max(40),
    links: linkList,
  })
  .refine((l) => !l.validFrom || !l.validTo || l.validTo >= l.validFrom, { message: "the validity ends before it starts", path: ["validTo"] })
  .refine((l) => l.surcharges.every((s) => s.tables.every((i) => i < l.tables.length)), { message: "a surcharge names a table the layout does not have", path: ["surcharges"] });

/**
 * The AI's answer made fit for checking where it only falls short in small things: missing lists
 * as empty, missing columns as none, codes that are no UN/LOCODE dropped, terms and links as for
 * rail, a missing name filled in. What it says about sheets, rows, columns and amounts is left.
 */
export function tidyOceanLayout(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const given = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
  // A port list holds UN/LOCODEs as written in capitals; a name such as "Lagos" is no code.
  const codes = (v: unknown) => asArray(v).map((c) => String(c ?? "").trim()).filter((c) => /^[A-Z]{2}[A-Z0-9]{3}$/.test(c));
  const name = String(input.name ?? "").trim();
  const portCodes = isRecord(input.portCodes)
    ? Object.fromEntries(Object.entries(input.portCodes).map(([k, v]) => [k.trim(), String(v ?? "").trim().toUpperCase()]).filter(([k, v]) => k && /^[A-Z]{2}[A-Z0-9]{3}$/.test(v!)))
    : {};
  return {
    ...input,
    name: (name || "Ocean tariff").slice(0, 200),
    portCodes,
    tables: asArray(input.tables).map((t) =>
      isRecord(t) ? { lastDataRow: null, pol: null, polFixed: null, via: null, currency: null, currencyFixed: null, note: null, podCountries: [], ...given(t) } : t,
    ),
    surcharges: asArray(input.surcharges)
      .filter(isRecord)
      .map((s) => ({
        equipment: [],
        tables: [],
        countries: [],
        exceptCountries: [],
        condition: "always",
        charge: "other",
        ...given(s),
        ports: codes(s.ports),
        exceptPorts: codes(s.exceptPorts),
      }))
      .slice(0, 60),
    conditions: tidyConditions(input.conditions).slice(0, 40),
    links: tidyLinks(input.links),
  };
}

/** A layout as checked and tidied; one that does not hold is refused with the first problem found. */
export function parseOceanLayout(input: unknown): OceanLayout {
  const parsed = layoutSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0]!;
  const where = issue.path.join(".");
  throw APIError.invalidArgument(`The tariff layout is not usable: ${where ? `${where} ` : ""}${issue.message}`);
}

/** Whether the layout can be read from the file at all: every sheet it names is there and long enough. */
export function oceanLayoutProblem(layout: OceanLayout, sheets: { name: string; rowCount: number }[]): string | null {
  for (const t of layout.tables) {
    const sheet = sheets.find((s) => s.name === t.sheet);
    if (!sheet) return `The file has no sheet "${t.sheet}" (the rate table "${t.label}")`;
    if (t.firstDataRow > sheet.rowCount) return `Sheet "${t.sheet}" has only ${sheet.rowCount} rows (the rate table "${t.label}")`;
  }
  return null;
}
