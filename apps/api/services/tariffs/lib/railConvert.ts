import { isRealYmd } from "../../../lib/businessDate";
import type { ColumnLetter, FindingLevel, RailBand, RailLayout, RailRateRow, TariffFinding } from "../interfaces/interfaces";
import { type CellValue, type Sheet, cellText } from "./sheet";

// A rail tariff's sheet turned into rows of prices by its layout, and checked. Every row is
// converted by code, never retyped by the AI, so a figure can only be what the sheet says.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A band's code, the key of its prices: "20ft-14t", "21-29ft-32t", "40ft-any". */
export function bandCode(b: RailBand): string {
  const length = b.minLengthFt === b.maxLengthFt ? `${b.minLengthFt}ft` : `${b.minLengthFt}-${b.maxLengthFt}ft`;
  const weight = b.maxGrossTonnes === null ? "any" : `${Number(b.maxGrossTonnes.toFixed(3))}t`;
  return `${length}-${weight}`;
}

const NOTE_RANGE = /(?:ZIP|PSČ|PSC|PLZ|postcodes?|postal codes?)\s*:?\s*(\d{3}\s?\d{2})\s*[-–—]\s*(\d{3}\s?\d{2})/i;

/**
 * The postcodes a row covers: a 5-digit postcode itself, "1xxxx" all of 10000–19999. A note naming a
 * range ("ZIP 10000-19900") wins: the tariff uses it to say a city's price covers its whole area.
 */
export function postcodeRange(postcode: string, note: string): { from: string; to: string } | null {
  const inNote = NOTE_RANGE.exec(note);
  if (inNote) return { from: inNote[1]!.replace(/\s/g, ""), to: inNote[2]!.replace(/\s/g, "") };
  const p = postcode.replace(/\s/g, "");
  if (/^\d{5}$/.test(p)) return { from: p, to: p };
  if (/^\d{1,4}x+$/i.test(p) && p.length === 5) return { from: p.replace(/x/gi, "0"), to: p.replace(/x/gi, "9") };
  return null;
}

const NO_PRICE = new Set(["", "-", "–", "—", "n/a", "na", "on request", "upon request"]);

export type PriceCell = { kind: "price"; amount: number } | { kind: "none" } | { kind: "text" };

// A price as the tariff writes it: a number, or text such as "1 046", "1.046,50", "1,046.50", "1046 EUR", "1.046,-".
export function parsePrice(v: CellValue | undefined): PriceCell {
  if (v === undefined) return { kind: "none" };
  if (typeof v === "number") return Number.isFinite(v) ? { kind: "price", amount: round2(v) } : { kind: "text" };
  if (typeof v !== "string") return { kind: "text" };
  const text = v.trim().toLowerCase();
  if (NO_PRICE.has(text)) return { kind: "none" };
  // ",-" after whole money is written for "no cents".
  let s = text.replace(/eur|€|czk|kč|usd|\$/g, "").replace(/[\s  ']/g, "").replace(/[.,][-–—]+$/, "");
  if (s.includes(".") && s.includes(",")) {
    // The last separator is the decimal one.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { kind: "text" };
  return { kind: "price", amount: round2(Number(s)) };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// A date cell as YYYY-MM-DD: a date, an Excel day number, "2026-01-01" or "1.1.2026"; undefined when unreadable.
function parseDate(v: CellValue | undefined): string | null | undefined {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel counts days from 1899-12-30; only plausible tariff years are taken as dates.
    if (v < 30000 || v > 80000) return undefined;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const dotted = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/.exec(s);
  const ymd = isoDate ? `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}` : dotted ? `${dotted[3]}-${pad2(Number(dotted[2]))}-${pad2(Number(dotted[1]))}` : null;
  // "31.04.2026" is no day: the database would refuse it.
  return ymd && isRealYmd(ymd) ? ymd : undefined;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const MAX_FINDING_ROWS = 20;

// Problems collected one per kind (and column), each with how many rows have it and the first few.
export class Findings {
  private readonly byKey = new Map<string, TariffFinding>();

  add(level: FindingLevel, code: string, message: string, row?: number, column?: ColumnLetter) {
    const key = `${code}|${column ?? ""}`;
    let finding = this.byKey.get(key);
    if (!finding) {
      finding = { level, code, message, count: 0, rows: [], ...(column ? { column } : {}) };
      this.byKey.set(key, finding);
    }
    finding.count += 1;
    if (row !== undefined && finding.rows.length < MAX_FINDING_ROWS) finding.rows.push(row);
  }

  list(): TariffFinding[] {
    // Errors first: they are what stops an approval.
    return [...this.byKey.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  }
}

const bandName = (b: RailBand) => `column ${b.column} (${b.label})`;

/** Every price row of the sheet by the layout, and what the checks found. */
export function convertRail(sheet: Sheet, layout: RailLayout): { rows: RailRateRow[]; findings: TariffFinding[] } {
  const found = new Findings();
  const { columns: col, bands } = layout;
  const codes = bands.map(bandCode);
  const rows: RailRateRow[] = [];
  const seen = new Set<string>();

  if (!bands.length) found.add("error", "no_bands", "No price column is set: say which columns hold the prices.");
  // Prices are kept by container length and weight: two columns read the same would overwrite each other.
  codes.forEach((code, i) => {
    const first = codes.indexOf(code);
    if (first < i) {
      found.add(
        "error",
        "band_duplicate",
        `Price columns ${bands[first]!.column} and ${bands[i]!.column} are set to the same container length and weight; give each its own, or remove one.`,
        undefined,
        bands[i]!.column,
      );
    }
  });
  if (!layout.validFrom) found.add("error", "validity_missing", "The tariff's start date is missing: set the date it is valid from.");
  if (!layout.validTo) found.add("warning", "no_end_date", "The tariff has no end date: it prices until a newer version replaces it.");

  const last = layout.lastDataRow ?? Infinity;
  const rowNos = [...sheet.rows.keys()].filter((r) => r >= layout.firstDataRow && r <= last).sort((a, b) => a - b);
  for (const rowNo of rowNos) {
    const cells = sheet.rows.get(rowNo)!;
    const text = (c: ColumnLetter | null) => (c ? cellText(cells[c]) : "");
    const place = text(col.place);
    const cellsOfBands = bands.map((b) => parsePrice(cells[b.column]));
    const hasPrice = cellsOfBands.some((p) => p.kind === "price");

    // A blank or separator row; a footnote under the prices has no price either.
    if (!place && !hasPrice) continue;
    if (!place) {
      found.add("error", "place_missing", "Rows with prices but no place: the place column is empty. If they are below the table, set the last price row.", rowNo, col.place);
      continue;
    }
    // A heading or a remark in the place column, between or under the prices.
    if (cellsOfBands.every((p) => p.kind === "none")) {
      found.add("warning", "row_without_prices", "Rows with a place but no price in any price column were left out (a heading or a remark?).", rowNo);
      continue;
    }

    const prices: Record<string, number> = {};
    cellsOfBands.forEach((p, i) => {
      const band = bands[i]!;
      if (p.kind === "text") {
        found.add("warning", "price_not_number", `Prices in ${bandName(band)} that are not a number; those rows have no price for it.`, rowNo, band.column);
      } else if (p.kind === "none") {
        if (hasPrice) found.add("warning", "band_empty", `Rows without a price in ${bandName(band)}; those places have no price for it.`, rowNo, band.column);
      } else if (p.amount === 0) {
        found.add("warning", "price_zero", `Prices of 0 in ${bandName(band)} were read as no price for those places.`, rowNo, band.column);
      } else if (p.amount < 0) {
        found.add("error", "price_not_positive", `Prices below zero in ${bandName(band)}.`, rowNo, band.column);
      } else {
        prices[codes[i]!] = p.amount;
      }
    });

    let via = text(col.via);
    let emptyDepot = text(col.emptyDepot);
    if (col.via && col.via === col.emptyDepot) {
      const [first, second] = via.split("/").map((s) => s.trim());
      via = first ?? "";
      emptyDepot = second ?? via;
    }

    const dates = [col.validFrom, col.validTo].map((c) => {
      if (!c) return null;
      const date = parseDate(cells[c]);
      if (date === undefined) found.add("warning", "date_unreadable", `Dates in column ${c} that could not be read; those rows take the tariff's dates.`, rowNo, c);
      return date ?? null;
    });
    const [validFrom, validTo] = dates as [string | null, string | null];

    const countryCell = text(col.country);
    const country = /^[a-z]{2}$/i.test(countryCell) ? countryCell.toUpperCase() : layout.defaultCountry;
    // A postcode typed as a number loses its leading zero in Excel (01067 Dresden becomes 1067).
    const postcodeCell = col.postcode ? cells[col.postcode] : undefined;
    const postcode =
      typeof postcodeCell === "number" && Number.isInteger(postcodeCell) && postcodeCell > 0 && postcodeCell < 100000 ? String(postcodeCell).padStart(5, "0") : text(col.postcode);
    const note = text(col.note);
    const range = postcodeRange(postcode, note);
    if (postcode && !range) found.add("warning", "postcode_unreadable", "Postcodes that are not 5 digits; those rows are found by place name only.", rowNo, col.postcode ?? undefined);

    const key = [country, postcode, place, via, emptyDepot].join("|").toLowerCase();
    if (seen.has(key)) found.add("warning", "duplicate_row", "Rows repeating an earlier row's place, postcode and terminals.", rowNo);
    seen.add(key);

    if (
      (validFrom && ((layout.validFrom && validFrom < layout.validFrom) || (layout.validTo && validFrom > layout.validTo))) ||
      (validTo && ((layout.validTo && validTo > layout.validTo) || (layout.validFrom && validTo < layout.validFrom)))
    ) {
      found.add("warning", "row_validity_outside", "Rows whose own dates fall outside the tariff's validity.", rowNo);
    }

    rows.push({
      rowNo,
      country,
      postcode,
      postcodeFrom: range?.from ?? null,
      postcodeTo: range?.to ?? null,
      place,
      region: text(col.region),
      via,
      emptyDepot,
      note,
      validFrom,
      validTo,
      prices,
    });
  }

  if (!rows.length) found.add("error", "no_rows", "No price rows were read: check the first price row and the place column.");
  checkHeavierCheaper(rows, bands, codes, found);
  checkOutliers(rows, bands, codes, found);
  return { rows, findings: found.list() };
}

// Within one container length, a heavier band should not cost less than a lighter one.
function checkHeavierCheaper(rows: RailRateRow[], bands: RailBand[], codes: string[], found: Findings) {
  const groups = new Map<string, number[]>();
  bands.forEach((b, i) => {
    const key = `${b.minLengthFt}-${b.maxLengthFt}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const ordered = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => (bands[a]!.maxGrossTonnes ?? Infinity) - (bands[b]!.maxGrossTonnes ?? Infinity)));
  for (const row of rows) {
    const cheaper = ordered.some((g) => {
      const amounts = g.map((i) => row.prices[codes[i]!]).filter((a): a is number => a !== undefined);
      return amounts.some((a, i) => i > 0 && a < amounts[i - 1]!);
    });
    if (cheaper) found.add("warning", "heavier_cheaper", "Rows where a heavier container costs less than a lighter one of the same length.", row.rowNo);
  }
}

// A price far from the band's usual level is often a typo (a missing or extra digit).
function checkOutliers(rows: RailRateRow[], bands: RailBand[], codes: string[], found: Findings) {
  bands.forEach((band, i) => {
    const code = codes[i]!;
    const amounts = rows.map((r) => r.prices[code]).filter((a): a is number => a !== undefined);
    if (amounts.length < 5) return;
    const mid = median(amounts);
    for (const row of rows) {
      const a = row.prices[code];
      if (a !== undefined && (a > mid * 4 || a < mid / 4)) {
        found.add("warning", "price_outlier", `Prices in ${bandName(band)} far from its usual level (median ${mid}); check for a typo.`, row.rowNo, band.column);
      }
    }
  });
}

/** How many problem rows there are of each level. */
export function findingTotals(findings: TariffFinding[]): { errors: number; warnings: number } {
  return findings.reduce(
    (t, f) => (f.level === "error" ? { ...t, errors: t.errors + f.count } : { ...t, warnings: t.warnings + f.count }),
    { errors: 0, warnings: 0 },
  );
}
