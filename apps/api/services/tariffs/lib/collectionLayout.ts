import { z } from "zod";
import { APIError } from "encore.dev/api";
import type { CollectionLayout } from "../interfaces/interfaces";
import { asArray, isRecord, isoDate, letter, linkList, tidyConditions, tidyLinks } from "./railLayout";

// The layout of a collections tariff's file, checked the same way whether the AI proposed it or a
// user corrected it: letters upper case, dates real, the tables a zone needs there, the bands in
// order. Pure.

const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "must be a country code, e.g. CZ");

const firstRow = z.number().int().min(1);
const lastRow = z.number().int().min(1).nullable();

const zone = z.object({
  column: letter,
  label: z.string().trim().min(1).max(100),
  kmTo: z.number().positive().max(5000).nullable(),
  zone: z.string().trim().min(1).max(30).nullable(),
});

const matrix = z
  .object({
    label: z.string().trim().min(1).max(100),
    country,
    sheet: z.string().min(1),
    headerRow: firstRow,
    firstDataRow: firstRow,
    lastDataRow: lastRow,
    weightTo: letter,
    volumeTo: letter.nullable(),
    zones: z.array(zone).min(1).max(30),
  })
  .refine((m) => m.firstDataRow > m.headerRow, { message: "the first price row must come after the headings row", path: ["firstDataRow"] })
  .refine((m) => m.lastDataRow === null || m.lastDataRow >= m.firstDataRow, { message: "the last price row comes before the first", path: ["lastDataRow"] })
  .refine((m) => new Set(m.zones.map((z) => z.column)).size === m.zones.length, { message: "a zone column is listed twice", path: ["zones"] });

const regions = z.object({
  sheet: z.string().min(1),
  firstDataRow: firstRow,
  lastDataRow: lastRow,
  postcode: letter,
  region: letter,
  country: letter.nullable(),
  place: letter.nullable(),
  countryCodes: z.record(z.string().trim().min(1), country),
  defaultCountry: country,
});

const distances = z.object({
  sheet: z.string().min(1),
  firstDataRow: firstRow,
  lastDataRow: lastRow,
  fromRegion: letter,
  toRegion: letter,
  km: letter,
});

const areas = z.object({
  sheet: z.string().min(1),
  firstDataRow: firstRow,
  lastDataRow: lastRow,
  postcodeFrom: letter,
  postcodeTo: letter.nullable(),
  zone: letter,
  country: letter.nullable(),
  defaultCountry: country,
});

const surcharge = z
  .object({
    kind: z.enum(["oversize", "percent", "flat"]),
    label: z.string().trim().min(1).max(100),
    overLengthCm: z.number().positive().max(10_000).nullable(),
    percent: z.number().min(-100).max(1000).nullable(),
    amount: z.number().min(0).nullable(),
  })
  .refine((s) => s.kind !== "oversize" || (s.overLengthCm !== null && s.percent !== null), { message: "an oversize surcharge needs a length and a %" })
  .refine((s) => s.kind !== "percent" || s.percent !== null, { message: "a % surcharge needs its %" })
  .refine((s) => s.kind !== "flat" || s.amount !== null, { message: "a flat surcharge needs its amount" });

const increasing = (values: number[]) => values.every((v, i) => i === 0 || v > values[i - 1]!);

const layoutSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "must be a currency code, e.g. CZK"),
    validFrom: isoDate.nullable(),
    validTo: isoDate.nullable(),
    zoneBy: z.enum(["distance", "postcode"]),
    matrices: z.array(matrix).min(1).max(10),
    kgPerCbm: z.number().positive().max(10_000).nullable(),
    regions: regions.nullable(),
    distances: distances.nullable(),
    sameRegionKm: z.number().min(0).max(1000).nullable(),
    areas: areas.nullable(),
    surcharges: z.array(surcharge).max(20),
    conditions: z.array(z.string().trim().min(1).max(500)).max(30),
    links: linkList,
  })
  .refine((l) => !l.validFrom || !l.validTo || l.validTo >= l.validFrom, { message: "the validity ends before it starts", path: ["validTo"] })
  .refine((l) => l.zoneBy !== "distance" || (l.regions !== null && l.distances !== null), {
    message: "zones by distance need the tariff's postcode → region list and its distance list",
    path: ["regions"],
  })
  .refine((l) => l.zoneBy !== "postcode" || l.areas !== null, { message: "zones by postcode need the tariff's postcode areas", path: ["areas"] })
  .refine((l) => l.zoneBy !== "distance" || l.matrices.every((m) => m.zones.every((z) => z.kmTo !== null) && increasing(m.zones.map((z) => z.kmTo!))), {
    message: "every zone column needs its km, each further than the one before",
    path: ["matrices"],
  })
  .refine((l) => l.zoneBy !== "postcode" || l.matrices.every((m) => m.zones.every((z) => z.zone !== null)), {
    message: "every zone column needs the zone its postcode areas name",
    path: ["matrices"],
  });

/**
 * The AI's answer made fit for checking where it only falls short in small things: links and terms
 * as for rail, a missing table or factor as none, a zone without km or code as none, a missing
 * name or default country filled in. What it says about sheets, rows and columns is left as it is.
 */
export function tidyCollectionLayout(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const orNull = (v: unknown) => (v === undefined ? null : v);
  // A table's fields over its defaults; a field the AI left undefined keeps the default.
  const given = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
  const table = (v: unknown, defaults: Record<string, unknown>) => (isRecord(v) ? { ...defaults, ...given(v) } : null);
  const name = String(input.name ?? "").trim();
  return {
    ...input,
    name: (name || "Collections tariff").slice(0, 200),
    kgPerCbm: orNull(input.kgPerCbm),
    sameRegionKm: orNull(input.sameRegionKm),
    matrices: asArray(input.matrices).map((m) =>
      isRecord(m)
        ? {
            ...m,
            lastDataRow: orNull(m.lastDataRow),
            volumeTo: orNull(m.volumeTo),
            zones: asArray(m.zones).map((z) => (isRecord(z) ? { ...z, kmTo: orNull(z.kmTo), zone: z.zone == null ? null : String(z.zone) } : z)),
          }
        : m,
    ),
    regions: table(input.regions, { lastDataRow: null, country: null, place: null, countryCodes: {}, defaultCountry: "CZ" }),
    distances: table(input.distances, { lastDataRow: null }),
    areas: table(input.areas, { lastDataRow: null, postcodeTo: null, country: null, defaultCountry: "CZ" }),
    surcharges: asArray(input.surcharges)
      .filter(isRecord)
      .map((s) => ({ overLengthCm: null, percent: null, amount: null, ...given(s) }))
      .slice(0, 20),
    conditions: tidyConditions(input.conditions),
    links: tidyLinks(input.links),
  };
}

/** A layout as checked and tidied; one that does not hold is refused with the first problem found. */
export function parseCollectionLayout(input: unknown): CollectionLayout {
  const parsed = layoutSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0]!;
  const where = issue.path.join(".");
  throw APIError.invalidArgument(`The tariff layout is not usable: ${where ? `${where} ` : ""}${issue.message}`);
}

/** Whether the layout can be read from the file at all: every sheet it names is there and long enough. */
export function collectionLayoutProblem(layout: CollectionLayout, sheets: { name: string; rowCount: number }[]): string | null {
  const tables: { what: string; sheet: string; firstDataRow: number }[] = [
    ...layout.matrices.map((m) => ({ what: `the price table "${m.label}"`, sheet: m.sheet, firstDataRow: m.firstDataRow })),
    ...(layout.regions ? [{ what: "the postcode → region list", ...layout.regions }] : []),
    ...(layout.distances ? [{ what: "the distance list", ...layout.distances }] : []),
    ...(layout.areas ? [{ what: "the postcode areas", ...layout.areas }] : []),
  ];
  for (const t of tables) {
    const sheet = sheets.find((s) => s.name === t.sheet);
    if (!sheet) return `The file has no sheet "${t.sheet}" (${t.what})`;
    if (t.firstDataRow > sheet.rowCount) return `Sheet "${t.sheet}" has only ${sheet.rowCount} rows (${t.what})`;
  }
  return null;
}
