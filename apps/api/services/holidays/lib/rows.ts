// Holiday rows as read from a file: the columns of the World Holidays spreadsheet.
// Pure helpers (no I/O) so they can be unit-tested.

export interface HolidayRow {
  country: string;
  countryCode: string;
  nationalHoliday: string;
  nationalStart: string; // yyyy-mm-dd or ""
  nationalEnd: string;
  regionalHoliday: string;
  regionalStart: string;
  regionalEnd: string;
  regions: string;
}

export const HOLIDAY_KEYS: (keyof HolidayRow)[] = [
  "country",
  "countryCode",
  "nationalHoliday",
  "nationalStart",
  "nationalEnd",
  "regionalHoliday",
  "regionalStart",
  "regionalEnd",
  "regions",
];

const DATE_KEYS = new Set<keyof HolidayRow>(["nationalStart", "nationalEnd", "regionalStart", "regionalEnd"]);

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string => {
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject impossible dates such as 31.02.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
};

// Any date the files bring — a JS Date (Excel cell), an Excel serial number, yyyy-mm-dd,
// or day-first dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy — as yyyy-mm-dd; "" when not a date.
export function normalizeDate(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30).
    if (value < 1 || value > 2958465) return "";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[./-]\s*(\d{1,2})[./-]\s*(\d{4})$/);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  return "";
}

// A row from anything (AI JSON, spreadsheet) with every field a trimmed string and dates
// normalised. A one-day holiday gets its start date as end date.
export function cleanRow(raw: Partial<Record<keyof HolidayRow, unknown>>): HolidayRow {
  const row = {} as HolidayRow;
  for (const key of HOLIDAY_KEYS) {
    const v = raw[key];
    row[key] = DATE_KEYS.has(key) ? normalizeDate(v) : v == null ? "" : String(v).trim();
  }
  row.countryCode = row.countryCode.toUpperCase();
  if (row.nationalStart && !row.nationalEnd) row.nationalEnd = row.nationalStart;
  if (row.regionalStart && !row.regionalEnd) row.regionalEnd = row.regionalStart;
  return row;
}

// A row worth keeping names a country and at least one dated holiday.
export function isUsableRow(row: HolidayRow): boolean {
  const named = !!(row.country || row.countryCode);
  const national = !!(row.nationalHoliday && row.nationalStart);
  const regional = !!(row.regionalHoliday && row.regionalStart);
  return named && (national || regional);
}

// Identity of a holiday, for skipping rows that are already in the list.
export function rowKey(row: HolidayRow): string {
  return HOLIDAY_KEYS.map((k) => row[k].toLowerCase()).join("|");
}

// Spreadsheet header → field. Headers are compared as lowercase letters only, by prefix,
// so "Country cod…", "National start date" and "Region(s) / subdivision(s)" all match.
const HEADER_PREFIXES: [string, keyof HolidayRow][] = [
  ["countrycod", "countryCode"],
  ["isocode", "countryCode"],
  ["country", "country"],
  ["nationalholiday", "nationalHoliday"],
  ["nationalstart", "nationalStart"],
  ["nationalend", "nationalEnd"],
  ["regionalholiday", "regionalHoliday"],
  ["regionalstart", "regionalStart"],
  ["regionalend", "regionalEnd"],
  ["region", "regions"],
  ["subdivision", "regions"],
];

export function headerField(header: string): keyof HolidayRow | null {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (!h) return null;
  for (const [prefix, field] of HEADER_PREFIXES) if (h.startsWith(prefix)) return field;
  return null;
}

// Column index → field for a header row, or null when it doesn't look like the holiday
// sheet (it needs a country column and a holiday name and start date).
export function mapHeaders(headers: string[]): Map<number, keyof HolidayRow> | null {
  const map = new Map<number, keyof HolidayRow>();
  const seen = new Set<keyof HolidayRow>();
  headers.forEach((h, i) => {
    const field = headerField(h);
    if (field && !seen.has(field)) {
      map.set(i, field);
      seen.add(field);
    }
  });
  const hasCountry = seen.has("country") || seen.has("countryCode");
  const hasHoliday =
    (seen.has("nationalHoliday") && seen.has("nationalStart")) || (seen.has("regionalHoliday") && seen.has("regionalStart"));
  return hasCountry && hasHoliday ? map : null;
}

// The model's reply as rows: the first JSON array in the text (code fences allowed).
export function parseRowsJson(text: string): Partial<Record<keyof HolidayRow, unknown>>[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r === "object") : [];
  } catch {
    return [];
  }
}
