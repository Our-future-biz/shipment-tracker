import { INCOTERMS, type SalesQuoteData } from "./types";

/** What an inquiry can fill in of a quote: the keys parseInquiry may return. */
export type InquiryData = Pick<
  SalesQuoteData,
  | "customerName"
  | "customerContact"
  | "customerEmail"
  | "customerPhone"
  | "direction"
  | "serviceType"
  | "incoterm"
  | "origin"
  | "destination"
  | "readyDate"
  | "commodity"
  | "weight"
  | "cbm"
>;

/**
 * Extract the first capture group of a case-insensitive regex, trimmed.
 * Returns undefined when there is no match or the group is empty.
 */
function firstGroup(text: string, re: RegExp): string | undefined {
  const value = text.match(re)?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

// Where a word is first mentioned in a text; Infinity when it is not.
function firstAt(text: string, re: RegExp): number {
  const at = text.search(re);
  return at < 0 ? Infinity : at;
}

// ── Mail header ──
// An inquiry is often pasted with the header of the mail it came in. Those lines say who wrote
// to whom, when and under what subject, and nothing about the cargo: "To: sales@…" is not a
// destination and the day the mail was sent is not the day the cargo is ready. A header line is
// known by its name at the start of the line, also as a mail program dresses it in a quoted or
// forwarded mail: "> From: …", "*Sent:* …".
const MAIL_HEADER = /^[\s>*_|-]*(?:from|to|cc|bcc|sent|date|subject)[\s*_]*:/i;
const MAIL_FROM_LINE = /^[\s>*_|-]*from[\s*_]*:/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// ── Dates ──
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// A day as YYYY-MM-DD, or nothing when the calendar has no such day (31.2.).
function isoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

// The ways a date is written - with ".", "/" or "-" between its numbers - each with how it is
// read.
const DATE_FORMS: { form: RegExp; read: (parts: string[]) => string | undefined }[] = [
  // 2026-03-15. The year of a date before it starts none: 15.03.2026-20.03.2026 is two days.
  { form: /(?:^|[^\d./-])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/, read: ([y, m, d]) => isoDate(Number(y), Number(m), Number(d)) },
  // 15.3.2026, and as Czech dates are also written, with a space after each dot: 15. 3. 2026.
  { form: /(?:^|\D)(\d{1,2})[-/.] ?(\d{1,2})[-/.] ?(\d{4})(?!\d)/, read: ([d, m, y]) => isoDate(Number(y), Number(m), Number(d)) },
  // 15.3.26, a two-digit year being of this century. Only without spaces and with no time of
  // day behind it: in "15.3. 10:00" the 10 is an hour.
  { form: /(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?![\d:])/, read: ([d, m, y]) => isoDate(2000 + Number(y), Number(m), Number(d)) },
  // 15 March 2026. "Mar", "Sept" and "March" are all a month; "Marvel" is not.
  {
    form: /(?:^|\D)(\d{1,2})(?:st|nd|rd|th|\.)? +([a-z]{3,9})\.?,? +(\d{4})(?!\d)/i,
    read: ([d, name = "", y]) => {
      const month = MONTHS.findIndex((full) => full.startsWith(name.toLowerCase()));
      return month < 0 ? undefined : isoDate(Number(y), month + 1, Number(d));
    },
  },
];

/**
 * The first date in a text as YYYY-MM-DD. Nothing when the text holds no date ("next week") or
 * its first one does not exist: only a real date is stored as the readiness date.
 */
function normaliseDate(raw: string): string | undefined {
  let first: { at: number; date: string | undefined } | undefined;
  for (const { form, read } of DATE_FORMS) {
    const match = raw.match(form);
    const at = match?.index;
    if (match && at !== undefined && (!first || at < first.at)) first = { at, date: read(match.slice(1)) };
  }
  return first?.date;
}

// ── Numbers ──
// A number as it is written in a mail: digits in groups of three with spaces between them
// (12 500 - a mail program may put a no-break space there), or digits with dots and commas
// between them (12.500 / 1.250,5 / 14,5). It does not start in the middle of another number.
const NUMBER = String.raw`(?:^|[^\d.,])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*)`;
const WEIGHT = new RegExp(String.raw`${NUMBER}\s*(kgs?|t(?:on(?:ne)?s?)?)(?![a-z])`, "i");
// "\b" does not end "m³", so the unit ends where no letter or digit follows.
const VOLUME = new RegExp(String.raw`${NUMBER}\s*(?:cbm|m3|m³)(?![a-z0-9])`, "i");

/**
 * The value of a number as written. A space only ever groups digits. Of two different
 * separators the last is the decimal mark (1.250,5 and 1,250.5); the same one repeated groups
 * thousands (1.250.000). A single dot or comma can be either, and the unit decides (`lone`):
 * kilograms are written whole, so in front of exactly three digits it groups thousands
 * (1,250 kg and 12.500 kg); tons and cubic metres are written with decimals, often three of
 * them, so there it is always the decimal mark (2,5 t and 14,500 cbm).
 */
function readNumber(raw: string, lone: "thousands" | "decimal"): number {
  const spaced = /\s/.test(raw);
  const digits = raw.replace(/\s/g, "");
  const marks = digits.replace(/\d/g, "");
  if (marks.length === 0) return Number(digits);

  const last = digits.lastIndexOf(marks.slice(-1));
  const whole = digits.slice(0, last).replace(/[.,]/g, "");
  const rest = digits.slice(last + 1);

  let decimal: boolean;
  if (marks.length > 1) decimal = new Set(marks).size > 1;
  else if (spaced || lone === "decimal") decimal = true;
  // "0.500 kg" is half a kilogram: thousands are grouped after one to three digits, not after 0.
  else decimal = !(/^[1-9]\d{0,2}$/.test(whole) && rest.length === 3);

  return Number(decimal ? `${whole}.${rest}` : `${whole}${rest}`);
}

/**
 * Parse a free-text shipping inquiry (typical broker email) into a partial
 * SalesQuoteData. Only the fields that were confidently found are returned.
 */
export function parseInquiry(text: string): InquiryData {
  const result: InquiryData = {};

  // Everything is looked for in the text without the mail's header lines. The one thing the
  // header knows of the customer is the sender's address.
  const lines = text.split(/\r?\n/);
  const body = lines.filter((line) => !MAIL_HEADER.test(line)).join("\n");
  const sender = lines.find((line) => MAIL_FROM_LINE.test(line))?.match(EMAIL)?.[0];

  // --- Customer -------------------------------------------------------------
  const customerName = firstGroup(body, /(?:^|\n)\s*(?:company|customer)\s*:\s*(.+)/i);
  if (customerName) result.customerName = customerName;

  const customerContact = firstGroup(body, /(?:^|\n)\s*(?:contact|attn)\s*:\s*(.+)/i);
  if (customerContact) result.customerContact = customerContact;

  const customerEmail = sender ?? body.match(EMAIL)?.[0];
  if (customerEmail) result.customerEmail = customerEmail;

  const labelledPhone = firstGroup(
    body,
    /(?:^|\n)\s*(?:phone|tel|mobile)\s*:\s*(.+)/i,
  );
  const loosePhone = firstGroup(body, /(\+[\d][\d\s()./-]{6,}\d)/);
  const customerPhone = labelledPhone ?? loosePhone;
  if (customerPhone) result.customerPhone = customerPhone;

  // --- Direction ------------------------------------------------------------
  if (/\bimport\b/i.test(body)) {
    result.direction = "Import";
  } else if (/\bexport\b/i.test(body)) {
    result.direction = "Export";
  }

  // --- Service type ---------------------------------------------------------
  // The mode named first is the one asked for: "by sea, not by air" is sea.
  const mentioned = [
    { mode: "Air", at: firstAt(body, /\bair\b/i) },
    { mode: "Sea", at: firstAt(body, /\b(?:sea|fcl|lcl|container)\b/i) },
    { mode: "Rail", at: firstAt(body, /\brail\b/i) },
    { mode: "Road", at: firstAt(body, /\b(?:road|truck)\b/i) },
  ].reduce((first, next) => (next.at < first.at ? next : first));
  if (mentioned.at < Infinity) {
    // Sea is a full container unless LCL is said, and said before any container.
    const lcl = firstAt(body, /\blcl\b/i) < firstAt(body, /\b(?:fcl|container)\b/i);
    result.serviceType = mentioned.mode === "Sea" ? (lcl ? "Sea LCL" : "Sea FCL") : mentioned.mode;
  }

  // --- Incoterm -------------------------------------------------------------
  const incotermMatch = body.match(
    new RegExp(`\\b(${INCOTERMS.join("|")})\\b`, "i"),
  );
  const incoterm = incotermMatch?.[1];
  if (incoterm) result.incoterm = incoterm.toUpperCase();

  // --- Routing --------------------------------------------------------------
  const origin = firstGroup(body, /(?:^|\n)\s*(?:origin|from port|pol)\s*:\s*(.+)/i);
  if (origin) result.origin = origin;

  const destination = firstGroup(body, /(?:^|\n)\s*(?:destination|pod)\s*:\s*(.+)/i);
  if (destination) result.destination = destination;

  // --- Ready date -----------------------------------------------------------
  // A line that names the readiness decides alone: when it holds no date ("Ready: next week"),
  // another date in the text is not the readiness either.
  const readyLine = firstGroup(body, /(?:^|\n)\s*(?:(?:cargo\s+)?ready(?:\s*date)?|pickup date)\s*:\s*(.+)/i);
  const looseDate = body.match(/\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/)?.[0];
  const readyDate = normaliseDate(readyLine ?? looseDate ?? "");
  if (readyDate) result.readyDate = readyDate;

  // --- Commodity ------------------------------------------------------------
  const commodity = firstGroup(
    body,
    /(?:^|\n)\s*(?:commodity|cargo|goods)\s*:\s*(.+)/i,
  );
  if (commodity) result.commodity = commodity;

  // --- Weight ---------------------------------------------------------------
  const weightMatch = body.match(WEIGHT);
  const weightRaw = weightMatch?.[1];
  const weightUnit = weightMatch?.[2]?.toLowerCase();
  if (weightRaw && weightUnit) {
    const isTons = weightUnit.startsWith("t");
    const value = readNumber(weightRaw, isTons ? "decimal" : "thousands");
    // Tons become kilograms rounded to the gram: 16.1 × 1000 alone gives 16100.000000000002.
    if (Number.isFinite(value)) result.weight = isTons ? Math.round(value * 1e6) / 1e3 : value;
  }

  // --- CBM ------------------------------------------------------------------
  const cbmRaw = body.match(VOLUME)?.[1];
  if (cbmRaw) {
    const value = readNumber(cbmRaw, "decimal");
    if (Number.isFinite(value)) result.cbm = value;
  }

  return result;
}
