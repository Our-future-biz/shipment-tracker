import type {
  CollectionAreaRow,
  CollectionData,
  CollectionDistanceRow,
  CollectionLayout,
  CollectionRateRow,
  CollectionRegionRow,
  ColumnLetter,
  TariffFinding,
} from "../interfaces/interfaces";
import { Findings, parsePrice, postcodeRange } from "./railConvert";
import { type CellValue, type Sheet, cellText } from "./sheet";

// A collections tariff's file turned into data by its layout, and checked: the price tables row by
// row, and the tariff's own postcode → region list, distances or postcode areas. Every figure is
// read by code, never retyped by the AI.

// The rows a table covers: from its first data row to its last (or the end), the empty ones left out.
function tableRows(sheet: Sheet, firstDataRow: number, lastDataRow: number | null): [number, Record<ColumnLetter, CellValue>][] {
  const last = lastDataRow ?? sheet.rowCount;
  return [...sheet.rows.entries()].filter(([rowNo]) => rowNo >= firstDataRow && rowNo <= last).sort(([a], [b]) => a - b);
}

/** A number as the tariff writes it: 5, "5", "do 5 kg", "0,12 m3", "1 500"; null when there is none. */
export function numberIn(v: CellValue | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const match = /-?\d[\d\s  ]*(?:[.,]\d+)?/.exec(v);
  if (!match) return null;
  const n = Number(match[0].replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** A postcode as 5 digits: 11000, "110 00", and 9435 read as "09435" (a number loses its leading 0); null when it is none. */
export function postcode5(v: CellValue | undefined): string | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= 99999 ? String(v).padStart(5, "0") : null;
  const digits = cellText(v).replace(/\s/g, "");
  if (/^\d{5}$/.test(digits)) return digits;
  if (/^\d{4}$/.test(digits)) return digits.padStart(5, "0");
  return null;
}

// A cell as the text of a code: numbers without decimals ("5", not "5.0"), text trimmed.
const codeText = (v: CellValue | undefined) => (typeof v === "number" && Number.isInteger(v) ? String(v) : cellText(v));

function readRates(sheets: Sheet[], layout: CollectionLayout, found: Findings): CollectionRateRow[] {
  const rates: CollectionRateRow[] = [];
  layout.matrices.forEach((m, matrix) => {
    const sheet = sheets.find((s) => s.name === m.sheet);
    if (!sheet) return;
    let last = 0;
    let rows = 0;
    for (const [rowNo, cells] of tableRows(sheet, m.firstDataRow, m.lastDataRow)) {
      const weightCell = cells[m.weightTo];
      const priceCells = m.zones.map((z) => cells[z.column]);
      if (weightCell === undefined && priceCells.every((c) => c === undefined)) continue;
      const weight = numberIn(weightCell);
      if (weight === null || weight <= 0) {
        found.add("error", "weight_not_number", `${m.label}: the weight in column ${m.weightTo} is not a number of kg`, rowNo, m.weightTo);
        continue;
      }
      if (weight <= last) found.add("error", "weight_not_increasing", `${m.label}: the weights must grow from row to row`, rowNo, m.weightTo);
      last = Math.max(last, weight);
      const volume = m.volumeTo ? numberIn(cells[m.volumeTo]) : null;
      if (m.volumeTo && (volume === null || volume <= 0)) found.add("warning", "volume_missing", `${m.label}: a row has no volume in column ${m.volumeTo}, so volume cannot count as its weight`, rowNo, m.volumeTo);
      const prices = m.zones.map((z, i): number | null => {
        const cell = parsePrice(priceCells[i]);
        if (cell.kind === "none") {
          found.add("warning", "price_missing", `${m.label}: no price in column ${z.column} (${z.label})`, rowNo, z.column);
          return null;
        }
        if (cell.kind === "text") {
          found.add("error", "price_not_number", `${m.label}: the price in column ${z.column} (${z.label}) is not a number`, rowNo, z.column);
          return null;
        }
        if (cell.amount <= 0) {
          found.add("error", "price_not_positive", `${m.label}: a price in column ${z.column} (${z.label}) is 0 or less`, rowNo, z.column);
          return null;
        }
        return cell.amount;
      });
      rates.push({ matrix, rowNo, weightToKg: weight, volumeToCbm: volume !== null && volume > 0 ? volume : null, prices });
      rows += 1;
    }
    if (!rows) found.add("error", "no_rates", `${m.label}: no price rows found between row ${m.firstDataRow} and ${m.lastDataRow ?? "the end"}`);
  });
  return rates;
}

function readRegions(sheets: Sheet[], layout: CollectionLayout, found: Findings): CollectionRegionRow[] {
  const t = layout.regions;
  const sheet = t && sheets.find((s) => s.name === t.sheet);
  if (!t || !sheet) return [];
  const codes = new Map(Object.entries(t.countryCodes).map(([k, v]) => [k.trim().toUpperCase(), v]));
  const regions: CollectionRegionRow[] = [];
  for (const [rowNo, cells] of tableRows(sheet, t.firstDataRow, t.lastDataRow)) {
    const postcode = postcode5(cells[t.postcode]);
    const region = codeText(cells[t.region]);
    if (!postcode || !region) {
      found.add("warning", "region_row_unreadable", "Postcode → region list: a row without a 5-digit postcode or a region is left out", rowNo);
      continue;
    }
    const raw = t.country ? codeText(cells[t.country]).toUpperCase() : "";
    const country = codes.get(raw) ?? (/^[A-Z]{2}$/.test(raw) ? raw : t.defaultCountry);
    regions.push({ rowNo, postcode, region, country, place: t.place ? cellText(cells[t.place]) : "" });
  }
  if (!regions.length) found.add("error", "no_regions", "The postcode → region list has no rows: zones by distance cannot be found");
  // A postcode listed again in another region: counted once, at the sheet row where that happens.
  const firstRegion = new Map<string, string>();
  const reported = new Set<string>();
  for (const r of regions) {
    const first = firstRegion.get(r.postcode);
    if (first === undefined) firstRegion.set(r.postcode, r.region);
    else if (first !== r.region && !reported.has(r.postcode)) {
      reported.add(r.postcode);
      found.add("warning", "postcode_in_two_regions", "Some postcodes are in more than one region; the first row of each is used, as the tariff's own calculator does", r.rowNo, t.postcode);
    }
  }
  return regions;
}

function readDistances(sheets: Sheet[], layout: CollectionLayout, found: Findings): CollectionDistanceRow[] {
  const t = layout.distances;
  const sheet = t && sheets.find((s) => s.name === t.sheet);
  if (!t || !sheet) return [];
  const distances: CollectionDistanceRow[] = [];
  for (const [rowNo, cells] of tableRows(sheet, t.firstDataRow, t.lastDataRow)) {
    const fromRegion = codeText(cells[t.fromRegion]);
    const toRegion = codeText(cells[t.toRegion]);
    const km = numberIn(cells[t.km]);
    if (!fromRegion || !toRegion || km === null || km < 0) {
      found.add("warning", "distance_row_unreadable", "Distance list: a row without both regions and a number of km is left out", rowNo);
      continue;
    }
    distances.push({ fromRegion, toRegion, km: Math.round(km) });
  }
  if (!distances.length) found.add("error", "no_distances", "The distance list has no rows: zones by distance cannot be found");
  return distances;
}

function readAreas(sheets: Sheet[], layout: CollectionLayout, found: Findings): CollectionAreaRow[] {
  const t = layout.areas;
  const sheet = t && sheets.find((s) => s.name === t.sheet);
  if (!t || !sheet) return [];
  const areas: CollectionAreaRow[] = [];
  for (const [rowNo, cells] of tableRows(sheet, t.firstDataRow, t.lastDataRow)) {
    const zone = codeText(cells[t.zone]);
    const from = t.postcodeTo ? postcode5(cells[t.postcodeFrom]) : null;
    const to = t.postcodeTo ? postcode5(cells[t.postcodeTo]) : null;
    // One column: a postcode, or a prefix such as "1xxxx" for 10000–19999.
    const range = t.postcodeTo ? (from && to ? { from, to } : null) : postcodeRange(codeText(cells[t.postcodeFrom]).padStart(5, "0"), "");
    if (!zone || !range || range.to < range.from) {
      found.add("warning", "area_row_unreadable", "Postcode areas: a row without a postcode range and a zone is left out", rowNo);
      continue;
    }
    const raw = t.country ? codeText(cells[t.country]).toUpperCase() : "";
    areas.push({ rowNo, postcodeFrom: range.from, postcodeTo: range.to, zone, country: /^[A-Z]{2}$/.test(raw) ? raw : t.defaultCountry });
  }
  if (!areas.length) found.add("error", "no_areas", "The postcode areas have no rows: zones by postcode cannot be found");
  return areas;
}

/** Everything the file holds by the layout, and what the checks found. */
export function convertCollection(sheets: Sheet[], layout: CollectionLayout): { data: CollectionData; findings: TariffFinding[] } {
  const found = new Findings();
  const rates = readRates(sheets, layout, found);
  const byDistance = layout.zoneBy === "distance";
  const regions = byDistance ? readRegions(sheets, layout, found) : [];
  const distances = byDistance ? readDistances(sheets, layout, found) : [];
  const areas = byDistance ? [] : readAreas(sheets, layout, found);
  // A table for a country nobody in the list is in can never be used.
  const countries = new Set([...regions.map((r) => r.country), ...areas.map((a) => a.country)]);
  for (const m of layout.matrices) {
    if (countries.size && !countries.has(m.country)) found.add("warning", "matrix_country_unused", `${m.label}: no postcode of the tariff is in ${m.country}, so the table is never used`);
  }
  return { data: { rates, regions, distances, areas }, findings: found.list() };
}
