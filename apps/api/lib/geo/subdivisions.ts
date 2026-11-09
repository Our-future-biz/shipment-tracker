import { fold } from "./format";

// The states and provinces places are often written with ("Aurora, IL"), named as the location
// database names them. No code is used twice between the two countries.

const US: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const CA: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NT: "Northwest Territories",
  NS: "Nova Scotia", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};

const BY_COUNTRY: Record<string, Record<string, string>> = { US, CA };

export interface Subdivision {
  countryCode: string;
  name: string;
}

/** The state or province a written part means ("IL", "il", "Illinois", "Québec"), in `countryCode` when given; null for none. */
export function subdivisionOf(text: string, countryCode?: string | null): Subdivision | null {
  const written = text.trim();
  for (const country of countryCode ? [countryCode] : Object.keys(BY_COUNTRY)) {
    const names = BY_COUNTRY[country];
    if (!names) continue;
    const name = names[written.toUpperCase()] ?? Object.values(names).find((n) => fold(n) === fold(written));
    if (name) return { countryCode: country, name };
  }
  return null;
}
