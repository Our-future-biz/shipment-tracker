import { COUNTRIES } from "./countries";

// How places and countries are written into shipments and quotes (mirrors apps/api/lib/geo/format.ts):
//   place:        "Hamburg (DEHAM)"  — UN/LOCODE name + code from the location database
//   country:      "Germany (DE)"     — ISO name + code
//   country code: "DE"
// A value in any other form (older data, or what the AI could not match) is flagged.

export type GeoKind = "place" | "country" | "countryCode";

export const isGeoKind = (type: string | undefined): type is GeoKind =>
  type === "place" || type === "country" || type === "countryCode";

const PLACE_RE = /^.+ \([A-Z]{2}[A-Z0-9]{3}\)$/;
const COUNTRY_RE = /^.+ \(([A-Z]{2})\)$/;

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export const countryLabel = (code: string) => `${COUNTRY_BY_CODE.get(code) ?? code} (${code})`;

/** The stored value of a country for a field kind. */
export const countryValue = (code: string, kind: GeoKind) => (kind === "countryCode" ? code : countryLabel(code));

/** The ISO code inside a stored country value, else null. */
export function countryCodeOf(value: string, kind: GeoKind): string | null {
  const code = kind === "countryCode" ? value.trim() : COUNTRY_RE.exec(value.trim())?.[1];
  return code && COUNTRY_BY_CODE.has(code) ? code : null;
}

/** True when a non-empty value is not in the database's form, so the screen flags it. */
export function isUnmatched(kind: GeoKind, value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (kind === "place") return !PLACE_RE.test(v);
  return countryCodeOf(v, kind) === null;
}

// Everyday names the country picker also finds (the ISO names read "United States of America",
// "Viet Nam", "Korea, Republic of"…).
const COUNTRY_ALIASES: Record<string, string> = {
  US: "usa america", GB: "uk britain england great britain", CZ: "czech republic", RU: "russia",
  KR: "south korea", KP: "north korea", VN: "vietnam", TW: "taiwan", IR: "iran", SY: "syria",
  LA: "laos", MD: "moldova", TZ: "tanzania", BO: "bolivia", VE: "venezuela", CI: "ivory coast",
  NL: "holland", TR: "turkey", AE: "uae emirates", MK: "macedonia",
};

/** True when typed text finds a country: by its name, its code or an everyday name. */
export function countryMatches(code: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return code.toLowerCase() === q || countryLabel(code).toLowerCase().includes(q) || (COUNTRY_ALIASES[code] ?? "").includes(q);
}

export const UNMATCHED_HINT = "Not from the database yet. Double-click and pick it from the list.";

/** Quote and extraction fields (by label) holding places or countries. */
export const LABEL_GEO_FIELDS: Record<string, GeoKind> = {
  Origin: "place",
  POL: "place",
  POD: "place",
  Destination: "place",
  HUB: "place",
  CFS: "place",
  "Cargo Origin": "country",
  "Country code": "countryCode",
  "Country Code": "countryCode",
};
