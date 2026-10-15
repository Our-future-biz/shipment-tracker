import { isRealYmd } from "../../../lib/businessDate";
import { QUOTE_FIELDS } from "./fields";

// What the reader of a customer's request returns, brought into the forms a Sales quote stores
// (apps/web/src/app/sales/_lib/types.ts): exact option names, a real day, plain numbers. A value
// that does not fit is left out, never guessed at.

// Twins of DIRECTIONS, SERVICE_TYPES and INCOTERMS in the web's Sales types; a test compares them.
export const QUOTE_DIRECTIONS = ["Export", "Import"] as const;
export const QUOTE_FREIGHT_MODES = ["Air", "Sea FCL", "Sea LCL", "Rail", "Road"] as const;
// The order of the rules (E, F, C, D groups), as the web's one list in lib/incoterms.ts.
export const QUOTE_INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"] as const;

const MAX_TEXT = 300;
const MAX_PHONE = 50;
// As EMAIL in apps/web/src/app/sales/_lib/parseInquiry.ts, but never from the middle of a word:
// "müller@firma.de" or "o'brien@acme.ie" is left out, not cut to "ller@firma.de" / "brien@acme.ie".
const EMAIL = /(?<![\p{L}\p{N}]'?)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu;

// One line: a line break (in an address) becomes ", ".
const oneLine = (text: string) => text.trim().replace(/\s*[\r\n]+\s*/g, ", ").replace(/\s+/g, " ");

// What a reader writes into a field the document leaves open ("N/A", "-", "not stated"): no value.
const NOTHING = /^(?:n\.?\/?a|none|null|nil|undefined|unknown|unspecified|tb[acd]|not (?:stated|specified|given|provided|available|applicable|mentioned|known))$/i;
const isNothing = (text: string) => !/[\p{L}\p{N}]/u.test(text) || NOTHING.test(text.replace(/^[\s("'[]+|[\s)"'\].]+$/g, ""));

// The one option a text names; nothing when it names none or several.
function only<T extends string>(found: T[]): T | undefined {
  const distinct = [...new Set(found)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

function direction(text: string): string | undefined {
  if (/^imp(ort)?$/i.test(text)) return "Import";
  if (/^exp(ort)?$/i.test(text)) return "Export";
  return undefined;
}

const MODE_WORDS: [RegExp, (typeof QUOTE_FREIGHT_MODES)[number]][] = [
  [/\blcl\b/i, "Sea LCL"],
  [/\bfcl\b/i, "Sea FCL"],
  [/\bair/i, "Air"],
  [/\brail/i, "Rail"],
  [/\b(road|truck|ftl|ltl)/i, "Road"],
];

// "Sea" alone is neither of the quote's two sea modes and is left out; named beside another mode
// ("air or sea", "Sea-Air") it is a second mode, so nothing comes out.
const PLAIN_SEA = /\b(?:sea|ocean)(?:freight)?\b/i;

function freightMode(text: string): string | undefined {
  const exact = QUOTE_FREIGHT_MODES.find((mode) => mode.toLowerCase() === text.toLowerCase());
  if (exact) return exact;
  const found = only(MODE_WORDS.filter(([word]) => word.test(text)).map(([, mode]) => mode));
  return found && !found.startsWith("Sea") && PLAIN_SEA.test(text) ? undefined : found;
}

function incoterm(text: string): string | undefined {
  const codes: readonly string[] = QUOTE_INCOTERMS;
  return only((text.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? []).filter((word) => codes.includes(word)));
}

function day(text: string): string | undefined {
  const ymd = text.slice(0, 10);
  return isRealYmd(ymd) ? ymd : undefined;
}

// A plain number above zero, to three decimals: "12 500 kg" -> "12500". Only the unit asked for and
// spaces that group digits in threes are dropped; a comma, another unit or any other text is not
// guessed at - "12,500" read as 12.5 would be a thousand times off.
function amount(text: string, unit: RegExp): string | undefined {
  const bare = text.replace(unit, "").trim();
  const digits = /^\d{1,3}(?: \d{3})+(?:\.\d+)?$/.test(bare) ? bare.replace(/ /g, "") : bare;
  if (!/^\d+(?:\.\d+)?$/.test(digits)) return undefined;
  const value = Math.round(Number(digits) * 1000) / 1000;
  return value > 0 ? String(value) : undefined;
}

// In kilograms a dot in front of exactly three digits can group thousands: "12.500 kg" is 12 500 in a
// Czech or German request, and the quote page's inquiry import reads it so (parseInquiry.ts). That
// shape is not guessed at either. "0.500" is half a kilogram and stays.
const KG = /\s*kgs?\.?$/i;
const weight = (text: string) => (/^[1-9]\d{0,2}\.\d{3}$/.test(text.replace(KG, "").trim()) ? undefined : amount(text, KG));

// Every label without a reader of its own is plain text.
const READERS: Record<string, (text: string) => string | undefined> = {
  Email: (text) => text.match(EMAIL)?.[0],
  Phone: (text) => ((text.match(/\d/g) ?? []).length >= 6 ? text.slice(0, MAX_PHONE) : undefined),
  "Trade Direction": direction,
  "Freight Mode": freightMode,
  Incoterm: incoterm,
  "Cargo Readiness Date": day,
  "Gross weight (kg)": weight,
  "Volume (cbm)": (text) => amount(text, /\s*(?:cbm|m3|m³)$/i),
};

/**
 * The quote fields of a read record, each in the form the quote stores it. Only the labels of
 * QUOTE_FIELDS come out, in that order: whatever else the model returned - a price, a label of
 * another reader - is gone. The record given is not changed.
 */
export function normalizeQuoteFields(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of QUOTE_FIELDS) {
    const text = typeof raw[label] === "string" ? oneLine(raw[label]) : "";
    if (!text || isNothing(text)) continue;
    const read = READERS[label];
    const value = read ? read(text) : text.slice(0, MAX_TEXT);
    if (value) out[label] = value;
  }
  return out;
}
