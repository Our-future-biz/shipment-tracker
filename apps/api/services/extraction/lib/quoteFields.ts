import { isRealYmd } from "../../../lib/businessDate";
import { QUOTE_FIELDS } from "./fields";

// What the reader of a customer's request returns, brought into the forms a Sales quote stores
// (apps/web/src/app/sales/_lib/types.ts): exact option names, a real day, plain numbers. A value
// that does not fit is left out, never guessed at.

// Twins of DIRECTIONS, SERVICE_TYPES and INCOTERMS in the web's Sales types; a test compares them.
export const QUOTE_DIRECTIONS = ["Export", "Import"] as const;
export const QUOTE_FREIGHT_MODES = ["Air", "Sea FCL", "Sea LCL", "Sea Break Bulk", "Rail", "Road"] as const;
// The order of the rules (E, F, C, D groups), as the web's one list in lib/incoterms.ts.
export const QUOTE_INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"] as const;
// The container types a quote line takes, per size: twins of CONTAINER_KINDS_BY_SIZE in the web's
// lib/cargo.ts, and the package types of PACKING_TYPES in its Sales types; a test compares them.
export const QUOTE_CONTAINER_KINDS: Record<string, readonly string[]> = {
  "20'": ["DC", "RF", "OT", "HOT", "FR"],
  "40'": ["DC", "HC", "HRF", "OT", "HOT", "FR", "HFR"],
  "45'": ["HQ"],
};
export const QUOTE_PACKING_TYPES = ["Pallets", "Colli", "Cartons", "Boxes", "Wooden boxes", "Crates", "Drums"] as const;

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
  [/\bbreak[\s-]?bulk\b/i, "Sea Break Bulk"],
  [/\bair/i, "Air"],
  [/\brail/i, "Rail"],
  [/\b(road|truck|ftl|ltl)/i, "Road"],
];

// "Sea" alone is none of the quote's sea modes and is left out; named beside another mode
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

// ─── Containers and packages ────────────────────────────────────────
// Each is one line of text the review shows and the user may correct: entries joined with "; ", in
// the form the web turns into the quote's lines (quoteCargoText.ts there). A list with any entry
// that cannot be read is left out whole: half the containers would price as the whole cargo.

// A plain number above zero from "12500", "12 500" or "12500.5"; the unit is cut off before.
const plain = (text: string) => amount(text, /$^/);

// "40HC", "40' high cube", "20GP", "40 reefer" → the quote's type ("40' HC"); undefined for none.
export function containerType(text: string): string | undefined {
  const t = text.toUpperCase().replace(/FEET|FOOT|FT|['’"´`]/g, " ").replace(/[\s\-_]+/g, " ").trim();
  const size = t.match(/^(20|40|45)\b|^(20|40|45)(?=[A-Z])/)?.[0];
  if (!size) return undefined;
  const rest = t.slice(size.length).replace(/\s+/g, "");
  const kinds = QUOTE_CONTAINER_KINDS[`${size}'`]!;
  let kind: string | undefined;
  if (size === "45") kind = /^(HC|HQ|HIGHCUBE|)$/.test(rest) ? "HQ" : undefined;
  else if (/^(HFR|HCFR|FRHC|HIGHCUBEFLATRACK)$/.test(rest)) kind = "HFR";
  else if (/^(HOT|HCOT|OTHC|OPENTOPHC|OPENTOPHIGHCUBE|HIGHCUBEOPENTOP)$/.test(rest)) kind = "HOT";
  else if (/^(HC|HQ|HIGHCUBE|HCDRY|HCDC|HCGP|HIGHCUBEDRY)$/.test(rest)) kind = "HC";
  else if (/^(RF|RE|RH|HR|HRF|RFHC|HCRF|REEFER|REEFERHC|HCREEFER|HIGHCUBEREEFER)$/.test(rest)) kind = size === "40" ? "HRF" : "RF";
  else if (/^(OT|OPENTOP)$/.test(rest)) kind = "OT";
  else if (/^(FR|FLATRACK|FLAT|PL|PLATFORM)$/.test(rest)) kind = "FR";
  else if (/^(DC|DV|GP|DRY|STD|ST|STANDARD|BOX|DRYVAN|GENERALPURPOSE|)$/.test(rest)) kind = "DC";
  return kind && kinds.includes(kind) ? `${size}' ${kind}` : undefined;
}

const PACKAGE_WORDS: [RegExp, string][] = [
  [/^(pallets?|plts?|skids?|euro ?pallets?|epal)$/i, "Pallets"],
  [/^(cartons?|ctns?|cardboard boxes)$/i, "Cartons"],
  [/^(wooden (boxes|box|cases?)|cases?)$/i, "Wooden boxes"],
  [/^(boxes|box|bx)$/i, "Boxes"],
  [/^(crates?)$/i, "Crates"],
  [/^(drums?|barrels?)$/i, "Drums"],
  [/^(colli|collis|packages?|pkgs?)$/i, "Colli"],
];

// The quote's package type for a word, "" for plain pieces; undefined for a word it has no type for.
export function packageType(text: string): string | undefined {
  const word = text.trim().replace(/\.$/, "");
  if (/^(pcs?|pieces?|units?|items?)$/i.test(word)) return "";
  return PACKAGE_WORDS.find(([pattern]) => pattern.test(word))?.[1];
}

const COUNT = /^(\d{1,4})\s*[x×*]?\s*/i;

// "2 x 20' DC, 18000 kg; 1 x 40' HC" with each entry in the quote's form.
function containers(text: string): string | undefined {
  const entries = text.split(";").map((e) => e.trim()).filter(Boolean);
  if (!entries.length) return undefined;
  const out: string[] = [];
  for (const entry of entries) {
    const m = entry.match(/^(\d{1,3})\s*[x×*]\s*([^,]+?)\s*(?:,\s*(.+))?$/i);
    if (!m) return undefined;
    const qty = Number(m[1]);
    const type = containerType(m[2]!);
    if (!qty || !type) return undefined;
    let line = `${qty} x ${type}`;
    if (m[3]) {
      const kg = weight(m[3]);
      if (!kg || !KG.test(m[3])) return undefined;
      line += `, ${kg} kg`;
    }
    out.push(line);
  }
  return out.join("; ");
}

const SIZE = /^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*cm$/i;

// "4 x Pallets, 120 x 80 x 150 cm, 450 kg each; 3 pcs, 200 x 100 x 90 cm" with each entry in the quote's form.
function packages(text: string): string | undefined {
  const entries = text.split(";").map((e) => e.trim()).filter(Boolean);
  if (!entries.length) return undefined;
  const out: string[] = [];
  for (const entry of entries) {
    const [head = "", ...parts] = entry.split(",").map((p) => p.trim());
    const count = head.match(COUNT);
    const qty = Number(count?.[1]);
    if (!count || !qty) return undefined;
    const type = packageType(head.slice(count[0].length));
    if (type === undefined) return undefined;
    let line = type ? `${qty} x ${type}` : `${qty} pcs`;
    for (const part of parts) {
      const size = part.match(SIZE);
      if (size) {
        const [l, w, h] = size.slice(1).map((n) => plain(n!));
        if (!l || !w || !h) return undefined;
        line += `, ${l} x ${w} x ${h} cm`;
        continue;
      }
      const each = part.replace(/\s*(each|per (piece|pc|unit))$/i, "");
      const kg = KG.test(each) ? weight(each) : undefined;
      if (!kg) return undefined;
      line += `, ${kg} kg each`;
    }
    out.push(line);
  }
  return out.join("; ");
}

// Every label without a reader of its own is plain text.
const READERS: Record<string, (text: string) => string | undefined> = {
  Email: (text) => text.match(EMAIL)?.[0],
  Phone: (text) => ((text.match(/\d/g) ?? []).length >= 6 ? text.slice(0, MAX_PHONE) : undefined),
  "Trade Direction": direction,
  "Freight Mode": freightMode,
  Incoterms: incoterm,
  "Cargo Readiness Date": day,
  "Gross weight (kg)": weight,
  "Volume (cbm)": (text) => amount(text, /\s*(?:cbm|m3|m³)$/i),
  Containers: containers,
  Packages: packages,
};

// Lists whose entries may come one per line: each line becomes an entry.
const LISTS: readonly string[] = ["Containers", "Packages"];

/**
 * The quote fields of a read record, each in the form the quote stores it. Only the labels of
 * QUOTE_FIELDS come out, in that order: whatever else the model returned - a price, a label of
 * another reader - is gone. The record given is not changed.
 */
export function normalizeQuoteFields(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of QUOTE_FIELDS) {
    const given = typeof raw[label] === "string" ? raw[label] : "";
    const text = oneLine(LISTS.includes(label) ? given.replace(/\s*[\r\n]+\s*/g, "; ") : given);
    if (!text || isNothing(text)) continue;
    const read = READERS[label];
    const value = read ? read(text) : text.slice(0, MAX_TEXT);
    if (value) out[label] = value;
  }
  return out;
}
