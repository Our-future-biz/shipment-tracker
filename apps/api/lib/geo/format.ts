import { COUNTRIES } from "./countries";

// How places and countries are written into shipments and quotes, so every screen and the AI
// readers agree. Mirrored in apps/web/src/lib/places.ts.
//   place:        "Hamburg (DEHAM)"  — UN/LOCODE name + code from the location table
//                 "Shanghai Pudong International Airport (PVG)" — or, by air, an IATA airport
//                 (lib/geo/airports.ts), which placeCodeOf does not read: it is no UN/LOCODE
//   country:      "Germany (DE)"     — ISO name + code
//   country code: "DE"

export type GeoKind = "place" | "country" | "countryCode";

const PLACE_RE = /^(.+) \(([A-Z]{2}[A-Z0-9]{3})\)$/;
const COUNTRY_RE = /^(.+) \(([A-Z]{2})\)$/;

export const placeLabel = (name: string, code: string) => `${name} (${code})`;

/** The UN/LOCODE of a value already written as "Name (CODE)", else null. */
export function placeCodeOf(value: string): string | null {
  return PLACE_RE.exec(value.trim())?.[2] ?? null;
}

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const countryName = (code: string) => BY_CODE.get(code)?.name ?? null;

export function countryLabel(code: string): string | null {
  const name = countryName(code);
  return name ? `${name} (${code})` : null;
}

/** Folds case, accents and punctuation, so "Côte d’Ivoire" and "COTE D'IVOIRE" compare equal. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Everyday names the ISO list writes differently.
const ALIASES: Record<string, string> = {
  usa: "US", "united states": "US", america: "US", "u s a": "US", "u s": "US",
  uk: "GB", "united kingdom": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB",
  "czech republic": "CZ", czechia: "CZ", "ceska republika": "CZ",
  russia: "RU", "south korea": "KR", korea: "KR", "north korea": "KP",
  vietnam: "VN", "viet nam": "VN", taiwan: "TW", iran: "IR", syria: "SY", laos: "LA",
  moldova: "MD", tanzania: "TZ", bolivia: "BO", venezuela: "VE", "ivory coast": "CI",
  netherlands: "NL", holland: "NL", "the netherlands": "NL", turkey: "TR", turkiye: "TR",
  uae: "AE", emirates: "AE", "hong kong sar": "HK", macau: "MO", "slovak republic": "SK",
  deutschland: "DE", "p r china": "CN", prc: "CN", "peoples republic of china": "CN",
  "republic of korea": "KR", "brunei": "BN", "cape verde": "CV", swaziland: "SZ",
  "east timor": "TL", "north macedonia": "MK", macedonia: "MK", "palestine": "PS",
  "vatican": "VA", "micronesia": "FM", "congo dr": "CD", "dr congo": "CD", "democratic republic of congo": "CD",
};

const BY_NAME = new Map<string, string>();
for (const c of COUNTRIES) {
  BY_NAME.set(fold(c.name), c.code);
  // "Bolivia (Plurinational State of)" → "bolivia"; "Korea, Republic of" → "korea".
  BY_NAME.set(fold(c.name.replace(/\s*\(.*\)$/, "").replace(/,.*$/, "")), c.code);
}
for (const [alias, code] of Object.entries(ALIASES)) BY_NAME.set(fold(alias), code);
// The short names map to the main country, not the one that only shares a prefix.
BY_NAME.set("korea", "KR");

/** The ISO code of a country however it is written ("DE", "Germany", "Germany (DE)", "USA"), else null. */
export function resolveCountryCode(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const inParens = COUNTRY_RE.exec(t)?.[2];
  if (inParens && BY_CODE.has(inParens)) return inParens;
  const upper = t.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && BY_CODE.has(upper)) return upper;
  return BY_NAME.get(fold(t)) ?? null;
}

/** The stored form of a country for a field kind, or null when it is no known country. */
export function countryValue(code: string, kind: "country" | "countryCode"): string | null {
  if (!BY_CODE.has(code)) return null;
  return kind === "countryCode" ? code : countryLabel(code);
}
