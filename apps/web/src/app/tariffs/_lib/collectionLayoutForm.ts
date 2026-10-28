import type { interfaces } from "@/lib/api/client";

// Pure helpers of the "How the file was read" form of a collections tariff draft: what each choice
// means, the blank parts the form adds, the country codes as typed, and the layout as it is sent.

type Layout = interfaces.CollectionLayout;
type Matrix = interfaces.CollectionMatrix;
type Zone = interfaces.CollectionZone;
type Surcharge = interfaces.CollectionSurcharge;

export const ZONE_BY_OPTIONS: { value: interfaces.CollectionZoneBy; label: string }[] = [
  { value: "distance", label: "By distance (km between our hub and the customer)" },
  { value: "postcode", label: "By the customer's postcode area" },
];

export const SURCHARGE_KIND_OPTIONS: { value: interfaces.CollectionSurchargeKind; label: string }[] = [
  { value: "oversize", label: "Oversize (a long piece)" },
  { value: "percent", label: "% of the price, always" },
  { value: "flat", label: "Amount per consignment, always" },
];

/** {"1": "CZ", "2": "SK"} → "1=CZ, 2=SK" */
export const countryCodesText = (codes: Record<string, string>) =>
  Object.entries(codes)
    .map(([value, code]) => `${value}=${code}`)
    .join(", ");

/** "1=CZ, 2=SK" → {"1": "CZ", "2": "SK"}; a part that is no "value=XX" is left out. */
export function parseCountryCodes(text: string): Record<string, string> {
  const codes: Record<string, string> = {};
  for (const part of text.split(/[,;\n]/)) {
    const [value, code] = part.split("=").map((s) => s.trim());
    if (value && code && /^[A-Za-z]{2}$/.test(code)) codes[value] = code.toUpperCase();
  }
  return codes;
}

/** A new zone column: by distance 100 km further than the last one, by postcode the next zone number. */
export function newZone(matrix: Matrix, zoneBy: interfaces.CollectionZoneBy): Zone {
  const last = matrix.zones.at(-1);
  if (zoneBy === "distance") {
    const kmTo = (last?.kmTo ?? 0) + 100;
    return { column: "", label: `${kmTo} km`, kmTo, zone: null };
  }
  const zone = String(matrix.zones.length + 1);
  return { column: "", label: `Zone ${zone}`, kmTo: null, zone };
}

/** A new price table on the same sheet and rows as the last one, for another country. */
export function newMatrix(layout: Layout, firstSheet: string): Matrix {
  const last = layout.matrices.at(-1);
  return {
    label: "",
    country: "",
    sheet: last?.sheet ?? firstSheet,
    headerRow: last?.headerRow ?? 1,
    firstDataRow: last?.firstDataRow ?? 2,
    lastDataRow: last?.lastDataRow ?? null,
    weightTo: last?.weightTo ?? "",
    volumeTo: last?.volumeTo ?? null,
    zones: [],
  };
}

export const newSurcharge = (): Surcharge => ({ kind: "oversize", label: "Oversize", overLengthCm: null, percent: null, amount: null });

/** The tables a zone choice needs, blank where the layout has none yet: switching to distance adds the region and distance lists. */
export function withZoneBy(layout: Layout, zoneBy: interfaces.CollectionZoneBy, firstSheet: string): Layout {
  const blank = { sheet: firstSheet, firstDataRow: 2, lastDataRow: null };
  const matrices = layout.matrices.map((m) => ({
    ...m,
    zones: m.zones.map((z, i) => (zoneBy === "distance" ? { ...z, kmTo: z.kmTo ?? (i + 1) * 100 } : { ...z, zone: z.zone ?? String(i + 1) })),
  }));
  if (zoneBy === "distance") {
    return {
      ...layout,
      zoneBy,
      matrices,
      regions: layout.regions ?? { ...blank, postcode: "", region: "", country: null, place: null, countryCodes: {}, defaultCountry: "CZ" },
      distances: layout.distances ?? { ...blank, fromRegion: "", toRegion: "", km: "" },
    };
  }
  return { ...layout, zoneBy, matrices, areas: layout.areas ?? { ...blank, postcodeFrom: "", postcodeTo: null, zone: "", country: null, defaultCountry: "CZ" } };
}

const upper = (s: string) => s.trim().toUpperCase();
const upperOrNull = (s: string | null) => (s && s.trim() ? upper(s) : null);

/**
 * The layout as sent: text trimmed, letters and codes upper case, empty terms and links dropped, a
 * zone's km or code kept as its zone choice needs it, the tables the choice does not use left out,
 * and a surcharge's figures kept as its kind needs them.
 */
export function cleanCollectionLayout(layout: Layout): Layout {
  const byDistance = layout.zoneBy === "distance";
  return {
    ...layout,
    name: layout.name.trim(),
    currency: upper(layout.currency),
    matrices: layout.matrices.map((m) => ({
      ...m,
      label: m.label.trim(),
      country: upper(m.country),
      weightTo: upper(m.weightTo),
      volumeTo: upperOrNull(m.volumeTo),
      zones: m.zones.map((z) => ({
        column: upper(z.column),
        label: z.label.trim(),
        kmTo: byDistance ? z.kmTo : null,
        zone: byDistance ? null : (z.zone ?? "").trim() || null,
      })),
    })),
    regions:
      byDistance && layout.regions
        ? {
            ...layout.regions,
            postcode: upper(layout.regions.postcode),
            region: upper(layout.regions.region),
            country: upperOrNull(layout.regions.country),
            place: upperOrNull(layout.regions.place),
            defaultCountry: upper(layout.regions.defaultCountry),
          }
        : null,
    distances:
      byDistance && layout.distances
        ? { ...layout.distances, fromRegion: upper(layout.distances.fromRegion), toRegion: upper(layout.distances.toRegion), km: upper(layout.distances.km) }
        : null,
    sameRegionKm: byDistance ? layout.sameRegionKm : null,
    areas:
      !byDistance && layout.areas
        ? {
            ...layout.areas,
            postcodeFrom: upper(layout.areas.postcodeFrom),
            postcodeTo: upperOrNull(layout.areas.postcodeTo),
            zone: upper(layout.areas.zone),
            country: upperOrNull(layout.areas.country),
            defaultCountry: upper(layout.areas.defaultCountry),
          }
        : null,
    surcharges: layout.surcharges.map((s) => ({
      kind: s.kind,
      label: s.label.trim(),
      overLengthCm: s.kind === "oversize" ? s.overLengthCm : null,
      percent: s.kind === "flat" ? null : s.percent,
      amount: s.kind === "flat" ? s.amount : null,
    })),
    conditions: layout.conditions.map((c) => c.trim()).filter(Boolean),
    links: layout.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label || l.url),
  };
}

const isLetter = (s: string | null | undefined) => !!s && /^[A-Za-z]{1,3}$/.test(s.trim());
const isCountry = (s: string) => /^[A-Za-z]{2}$/.test(s.trim());

/** What keeps the form from being sent, in words; empty when it can be. The server checks the rest. */
export function collectionLayoutProblems(layout: Layout): string[] {
  const problems: string[] = [];
  const add = (p: string) => !problems.includes(p) && problems.push(p);
  if (!layout.name.trim()) add("The layout needs a name");
  if (!/^[A-Za-z]{3}$/.test(layout.currency.trim())) add("The currency is a 3-letter code, e.g. CZK");
  if (layout.validFrom && layout.validTo && layout.validTo < layout.validFrom) add("The validity ends before it starts");
  if (!layout.matrices.length) add("Add at least one price table");

  for (const m of layout.matrices) {
    const name = m.label.trim() || "A price table";
    if (!m.label.trim()) add("Every price table needs a name");
    if (!isCountry(m.country)) add(`${name}: the country is a 2-letter code, e.g. CZ`);
    if (!m.sheet) add(`${name}: choose its sheet`);
    if (!(m.firstDataRow > m.headerRow)) add(`${name}: the first price row must come after the headings row`);
    if (m.lastDataRow !== null && m.lastDataRow < m.firstDataRow) add(`${name}: the last price row comes before the first`);
    if (!isLetter(m.weightTo)) add(`${name}: choose the column of the weights`);
    if (m.volumeTo && !isLetter(m.volumeTo)) add(`${name}: the volume column is not a column letter`);
    if (!m.zones.length) add(`${name}: add at least one zone column`);
    if (m.zones.some((z) => !isLetter(z.column) || !z.label.trim())) add(`${name}: every zone needs its column and a heading`);
    if (new Set(m.zones.map((z) => z.column.trim().toUpperCase())).size !== m.zones.length) add(`${name}: a column is used for two zones`);
    if (layout.zoneBy === "distance") {
      const kms = m.zones.map((z) => z.kmTo);
      if (kms.some((km) => km === null || !(km > 0)) || kms.some((km, i) => i > 0 && (km ?? 0) <= (kms[i - 1] ?? 0))) {
        add(`${name}: every zone needs its km, each further than the one before`);
      }
    } else if (m.zones.some((z) => !(z.zone ?? "").trim())) {
      add(`${name}: every zone needs the zone its postcode areas name`);
    }
  }

  if (layout.zoneBy === "distance") {
    const r = layout.regions;
    const d = layout.distances;
    if (!r || !r.sheet || !isLetter(r.postcode) || !isLetter(r.region)) add("The postcode → region list needs its sheet, postcode column and region column");
    else if (!isCountry(r.defaultCountry)) add("The postcode → region list: the default country is a 2-letter code");
    if (!d || !d.sheet || !isLetter(d.fromRegion) || !isLetter(d.toRegion) || !isLetter(d.km)) add("The distance list needs its sheet and the columns of both regions and the km");
  } else {
    const a = layout.areas;
    if (!a || !a.sheet || !isLetter(a.postcodeFrom) || !isLetter(a.zone)) add("The postcode areas need their sheet, postcode column and zone column");
    else if (!isCountry(a.defaultCountry)) add("The postcode areas: the default country is a 2-letter code");
  }

  for (const s of layout.surcharges) {
    if (!s.label.trim()) add("Every surcharge needs a name");
    if (s.kind === "oversize" && (!(s.overLengthCm !== null && s.overLengthCm > 0) || s.percent === null)) add("An oversize surcharge needs the length and its %");
    if (s.kind === "percent" && s.percent === null) add("A % surcharge needs its %");
    if (s.kind === "flat" && s.amount === null) add("A flat surcharge needs its amount");
  }
  return problems;
}
