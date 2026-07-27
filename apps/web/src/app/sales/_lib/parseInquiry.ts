import type { SalesQuoteData } from "./types";

const INCOTERM_LIST = [
  "EXW",
  "FCA",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
] as const;

/**
 * Extract the first capture group of a case-insensitive regex, trimmed.
 * Returns undefined when there is no match or the group is empty.
 */
function firstGroup(text: string, re: RegExp): string | undefined {
  const value = text.match(re)?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * Normalise a raw date string to YYYY-MM-DD when it looks like either
 * YYYY-MM-DD / YYYY/MM/DD or DD.MM.YYYY / DD-MM-YYYY / DD/MM/YYYY.
 * Falls back to the raw (trimmed) string when it does not match.
 */
function normaliseDate(raw: string): string {
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  const dmy = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  return trimmed;
}

/**
 * Parse a free-text shipping inquiry (typical broker email) into a partial
 * SalesQuoteData. Only the fields that were confidently found are returned.
 */
export function parseInquiry(text: string): Partial<SalesQuoteData> {
  const result: Partial<SalesQuoteData> = {};

  // --- Customer -------------------------------------------------------------
  const customerName = firstGroup(text, /(?:^|\n)\s*(?:company|customer|from)\s*:\s*(.+)/i);
  if (customerName) result.customerName = customerName;

  const customerContact = firstGroup(text, /(?:^|\n)\s*(?:contact|attn)\s*:\s*(.+)/i);
  if (customerContact) result.customerContact = customerContact;

  const customerEmail = firstGroup(
    text,
    /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  );
  if (customerEmail) result.customerEmail = customerEmail;

  const labelledPhone = firstGroup(
    text,
    /(?:^|\n)\s*(?:phone|tel|mobile)\s*:\s*(.+)/i,
  );
  const loosePhone = firstGroup(text, /(\+[\d][\d\s()./-]{6,}\d)/);
  const customerPhone = labelledPhone ?? loosePhone;
  if (customerPhone) result.customerPhone = customerPhone;

  // --- Direction ------------------------------------------------------------
  if (/\bimport\b/i.test(text)) {
    result.direction = "Import";
  } else if (/\bexport\b/i.test(text)) {
    result.direction = "Export";
  }

  // --- Service type ---------------------------------------------------------
  if (/\bair\b/i.test(text)) {
    result.serviceType = "Air";
  } else if (/\b(?:fcl|container)\b/i.test(text)) {
    result.serviceType = "Sea FCL";
  } else if (/\blcl\b/i.test(text)) {
    result.serviceType = "Sea LCL";
  } else if (/\brail\b/i.test(text)) {
    result.serviceType = "Rail";
  } else if (/\b(?:road|truck)\b/i.test(text)) {
    result.serviceType = "Road";
  } else if (/\bsea\b/i.test(text)) {
    result.serviceType = "Sea FCL";
  }

  // --- Incoterm -------------------------------------------------------------
  const incotermMatch = text.match(
    new RegExp(`\\b(${INCOTERM_LIST.join("|")})\\b`, "i"),
  );
  const incoterm = incotermMatch?.[1];
  if (incoterm) result.incoterm = incoterm.toUpperCase();

  // --- Routing --------------------------------------------------------------
  const origin = firstGroup(text, /(?:^|\n)\s*(?:origin|from port|pol)\s*:\s*(.+)/i);
  if (origin) result.origin = origin;

  const destination = firstGroup(
    text,
    /(?:^|\n)\s*(?:destination|to|pod)\s*:\s*(.+)/i,
  );
  if (destination) result.destination = destination;

  // --- Ready date -----------------------------------------------------------
  const rawDate = firstGroup(
    text,
    /(?:^|\n)\s*(?:ready(?:\s*date)?|cargo ready|pickup date|ready)\s*:\s*(.+)/i,
  );
  const looseDate = firstGroup(
    text,
    /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/,
  );
  const readyDate = rawDate ?? looseDate;
  if (readyDate) result.readyDate = normaliseDate(readyDate);

  // --- Commodity ------------------------------------------------------------
  const commodity = firstGroup(
    text,
    /(?:^|\n)\s*(?:commodity|cargo|goods)\s*:\s*(.+)/i,
  );
  if (commodity) result.commodity = commodity;

  // --- Weight ---------------------------------------------------------------
  const weightMatch = text.match(
    /([\d]+(?:[.,]\d+)?)\s*(kgs?|tons?|t\b)/i,
  );
  const weightRaw = weightMatch?.[1];
  const weightUnit = weightMatch?.[2]?.toLowerCase();
  if (weightRaw) {
    const value = Number.parseFloat(weightRaw.replace(",", "."));
    if (Number.isFinite(value)) {
      const isTons = weightUnit != null && weightUnit.startsWith("t");
      result.weight = isTons ? value * 1000 : value;
    }
  }

  // --- CBM ------------------------------------------------------------------
  const cbmMatch = text.match(/([\d]+(?:[.,]\d+)?)\s*(?:cbm|m3|m³)\b/i);
  const cbmRaw = cbmMatch?.[1];
  if (cbmRaw) {
    const value = Number.parseFloat(cbmRaw.replace(",", "."));
    if (Number.isFinite(value)) result.cbm = value;
  }

  return result;
}
