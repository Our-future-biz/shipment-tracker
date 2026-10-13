import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { getClient, MODEL, replyText } from "../lib/anthropic";
import { parseJsonFromResponse } from "../lib/fields";
import { countryValue, fold, placeCodeOf, placeLabel, resolveCountryCode, type GeoKind } from "../../../lib/geo/format";
import type { Place } from "../../../lib/geo/place";

// Turns places and countries read by the AI (or typed into an inquiry) into the form the
// database uses: "Hamburg (DEHAM)", "Germany (DE)", "DE". Text that matches nothing is left
// as it was; the screens flag any value not in that form.

export interface GeoItem {
  text: string;
  kind: GeoKind;
  // What the field means, which tells a port from an airport or a town, e.g. "port of loading".
  role?: string;
}

/** The extracted fields that hold places or countries, by their extraction label. */
export const GEO_FIELDS: Record<string, { kind: GeoKind; role: string }> = {
  Origin: { kind: "place", role: "origin: the place where the cargo is received or starts" },
  POL: { kind: "place", role: "port of loading (a seaport for sea freight, an airport for air freight)" },
  POD: { kind: "place", role: "port of discharge (a seaport for sea freight, an airport for air freight)" },
  Destination: { kind: "place", role: "final destination: the place of delivery" },
  HUB: { kind: "place", role: "hub: the city of the inland hub" },
  CFS: { kind: "place", role: "CFS: the city of the container freight station" },
  "Cargo Origin": { kind: "country", role: "country the goods originate from" },
  "Country code": { kind: "countryCode", role: "country" },
};

const placeOf = (p: Place) => placeLabel(p.name, p.code);

/** "Ostend (Oostende)" is the same name as "Ostend" and as "Oostende". */
export function sameName(dbName: string, written: string): boolean {
  const w = fold(written);
  return [dbName, ...[...dbName.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!), dbName.replace(/\s*\(.*\)\s*/g, " ")].some(
    (n) => fold(n) === w,
  );
}

const BARE_CODE = /^([A-Z]{2})\s?([A-Z0-9]{3})$/;

/**
 * "Chicago, IL, United States" → name "Chicago", country "US"; "PORT OF HAMBURG" → "HAMBURG".
 * A bare two-letter last part ("Hamburg, DE" but also "Chicago, IL") may be a country code or
 * a state/province, so it is only a hint (`weakCountry`): the name is searched worldwide and
 * the hint applies only when the place exists in that country.
 */
export function splitPlace(text: string): { name: string; countryCode: string | null; weakCountry: boolean } {
  const parts = text.split(/[,;/]/).map((p) => p.trim()).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1]! : null;
  const countryCode = last ? resolveCountryCode(last) : null;
  const weakCountry = countryCode !== null && parts.length === 2 && /^[A-Za-z]{2}$/.test(last!);
  const name = (parts[0] ?? text)
    .replace(/^port\s+of\s+/i, "")
    .replace(/\s+(sea)?port$/i, "")
    .trim();
  return { name, countryCode, weakCountry };
}

// The places a lookup returned; on failure none, so the values stay as read and get flagged.
async function lookupPlaces(codes: string[], names: { name: string; countryCode?: string }[]): Promise<{ byCode: Place[]; candidates: Place[][] }> {
  try {
    return await auth.placeLookup({ codes, names });
  } catch (err) {
    log.error(err, "place lookup failed");
    return { byCode: [], candidates: names.map(() => []) };
  }
}

/** The stored form of each item, or null where nothing in the database matches it. */
export async function resolveGeo(items: GeoItem[]): Promise<(string | null)[]> {
  const out: (string | null)[] = items.map(() => null);
  // Items still open after the database pass, for one AI call: candidates are the database
  // rows the text could mean (empty when none were found by name).
  const open: { index: number; candidates: Place[] }[] = [];

  const placeItems: { index: number; code: string | null; name: string; countryCode: string | null; weakCountry: boolean }[] = [];
  items.forEach((item, index) => {
    const text = item.text.trim();
    if (!text) return;
    if (item.kind === "place") {
      const bare = BARE_CODE.exec(text);
      placeItems.push({ index, code: placeCodeOf(text) ?? (bare ? `${bare[1]}${bare[2]}` : null), ...splitPlace(text) });
      return;
    }
    const code = resolveCountryCode(text);
    const value = code ? countryValue(code, item.kind) : null;
    if (value) out[index] = value;
    else open.push({ index, candidates: [] });
  });

  if (placeItems.length > 0) {
    const { byCode, candidates } = await lookupPlaces(
      placeItems.flatMap((p) => (p.code ? [p.code] : [])),
      placeItems.map((p) => ({ name: p.name, countryCode: p.weakCountry ? undefined : (p.countryCode ?? undefined) })),
    );
    const known = new Map(byCode.map((p) => [p.code, p]));
    placeItems.forEach((p, i) => {
      let found = candidates[i] ?? [];
      if (p.weakCountry) {
        // "Hamburg, DE" keeps DE; "Chicago, IL" finds nothing in Israel and drops it.
        const inCountry = found.filter((c) => c.countryCode === p.countryCode);
        if (inCountry.length > 0) found = inCountry;
        else p.countryCode = null;
      }
      const coded = p.code ? known.get(p.code) : undefined;
      // A written "Name (CODE)" or a bare code wins, unless a bare word like "PARIS" is a real
      // place name that only happens to look like a code.
      const isLabel = p.code !== null && placeCodeOf(items[p.index]!.text) !== null;
      const exact = found.filter((c) => sameName(c.name, p.name));
      if (coded && (isLabel || exact.length === 0)) out[p.index] = placeOf(coded);
      // Only a lone exact name in the country the text names is taken as is: "Antwerp" must not
      // become "Antwerp Churchill Terminal" (the only name starting with it), nor "Gothenburg"
      // the town in Nebraska (the Swedish port is listed as "Göteborg"). The rest goes to the AI.
      else if (p.countryCode && found.length === 1 && exact.length === 1) out[p.index] = placeOf(found[0]!);
      else open.push({ index: p.index, candidates: found });
    });
  }

  if (open.length > 0) {
    const picks = await askAi(items, open);
    const suggested = [...new Set(Object.values(picks).filter((c): c is string => !!c))];
    const valid = suggested.length > 0 ? (await lookupPlaces(suggested, [])).byCode : [];
    const validByCode = new Map(valid.map((p) => [p.code, p]));
    for (const { index } of open) {
      const code = picks[index];
      if (!code) continue;
      const item = items[index]!;
      if (item.kind === "place") {
        const place = validByCode.get(code);
        if (place) out[index] = placeOf(place);
      } else {
        out[index] = countryValue(code, item.kind);
      }
    }
  }
  return out;
}

const MATCH_PROMPT = `You match places and countries read from shipping documents to a UN/LOCODE database.

You get a JSON list of items. Each has an index, the text as read, what the field means, and for places the candidate database entries (code, name, subdivision) the text could mean.

For each item return:
- place with candidates: the code of the candidate the text means. Use the field's meaning: a port of loading/discharge is the seaport (names often end in "Pt") for sea freight, not the airport, a single terminal or a small town of the same name; prefer the well-known place in the country the text names. If no candidate is the place itself (e.g. only a terminal or a suburb of it was found), give the UN/LOCODE of the place instead (local names differ, e.g. Antwerp is "Antwerpen" BEANR).
- place without candidates: the 5-character UN/LOCODE you are confident of (local names differ, e.g. Prague is "Praha" CZPRG, Vienna is "Wien" ATVIE). The code must be real.
- country: the ISO 3166-1 alpha-2 code. A US state or province means its country.
- null when you are not sure.

Return ONLY a JSON object mapping each index to a code or null, e.g. {"0": "DEHAM", "3": null}. No markdown.`;

async function askAi(items: GeoItem[], open: { index: number; candidates: Place[] }[]): Promise<Record<number, string | null>> {
  const payload = open.map(({ index, candidates }) => ({
    index,
    text: items[index]!.text,
    field: items[index]!.role ?? items[index]!.kind,
    ...(items[index]!.kind === "place" ? { candidates: candidates.map((c) => [c.code, c.name, c.subdivisionName ?? ""]) } : { kind: "country" }),
  }));
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: MATCH_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    const parsed = parseJsonFromResponse(replyText(response));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const picks: Record<number, string | null> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && /^[A-Z]{2}([A-Z0-9]{3})?$/.test(value.trim().toUpperCase())) {
        picks[Number(key)] = value.trim().toUpperCase();
      }
    }
    return picks;
  } catch (err) {
    // Without the AI the values stay as read and are flagged for a person to pick.
    log.error(err, "place matching failed");
    return {};
  }
}

/** Rewrites the place and country fields of extracted records in place (one lookup for all). */
export async function canonicalizeRecords(records: Record<string, string>[]): Promise<void> {
  const refs: { record: Record<string, string>; key: string }[] = [];
  const items: GeoItem[] = [];
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const geo = GEO_FIELDS[key];
      if (!geo || !value) continue;
      refs.push({ record, key });
      items.push({ text: value, kind: geo.kind, role: geo.role });
    }
  }
  if (items.length === 0) return;
  const resolved = await resolveGeo(items);
  resolved.forEach((value, i) => {
    if (value) refs[i]!.record[refs[i]!.key] = value;
  });
}
