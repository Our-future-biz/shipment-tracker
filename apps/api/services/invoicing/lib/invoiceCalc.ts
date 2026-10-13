/**
 * The invoice maths, done on the server from stored data only (never from numbers the
 * browser sends). Pure functions, so every rule is covered by unit tests.
 *
 *  - lines = selling rows ticked for Invoice, converted into the invoice currency by
 *    their own currency (rates: CZK per 1 unit, from the Exchange page)
 *  - every line is rounded to 2 decimals; totals are sums of rounded lines
 *  - VAT is calculated per VAT rate from the base of that rate (§37 ZDPH), and the
 *    base and VAT are also shown in CZK for the tax authority
 */

// ── Money ─────────────────────────────────────────────────────────────────────

/** Rounds to 2 decimals, half away from zero, without binary noise (1.005 -> 1.01). */
export function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const scaled = Number((Math.abs(v) * 100).toPrecision(15));
  return (Math.sign(v) * Math.round(scaled)) / 100;
}

/** Numeric columns arrive as strings ("4999.50") or null. */
function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── VAT ───────────────────────────────────────────────────────────────────────

export const VAT_CODES = ["S21", "Z69", "RC", "OUT", "NP"] as const;
export type VatCode = (typeof VAT_CODES)[number];

export interface VatCodeInfo {
  code: VatCode;
  /** VAT rate in percent */
  rate: number;
  label: string;
  /** Wording printed on the invoice for the lines with this code (Czech / English). */
  legalText: string;
}

export const VAT_CODE_INFO: Record<VatCode, VatCodeInfo> = {
  S21: { code: "S21", rate: 21, label: "21 %", legalText: "" },
  Z69: {
    code: "Z69",
    rate: 0,
    label: "0 % §69",
    legalText: "Osvobozeno od daně dle §69 ZDPH (mezinárodní přeprava) / VAT exempt – international transport (§69)",
  },
  RC: {
    code: "RC",
    rate: 0,
    label: "Reverse charge",
    legalText: "Daň odvede zákazník / Reverse charge – VAT to be accounted for by the customer",
  },
  OUT: {
    code: "OUT",
    rate: 0,
    label: "Outside VAT",
    legalText: "Mimo předmět daně – přefakturace / Outside the scope of VAT – disbursement",
  },
  NP: { code: "NP", rate: 0, label: "Not VAT payer", legalText: "Nejsme plátci DPH / Not registered for VAT" },
};

export function isVatCode(v: unknown): v is VatCode {
  return typeof v === "string" && (VAT_CODES as readonly string[]).includes(v);
}

/** Default before the user picks one: international shipments §69, domestic 21 %. */
export function defaultVatCode(tradeDirection: string): VatCode {
  const d = (tradeDirection ?? "").trim().toLowerCase();
  return d.includes("import") || d.includes("export") ? "Z69" : "S21";
}

/**
 * The VAT code a line is invoiced with: an issuer who is not a VAT payer never charges
 * VAT; otherwise the code chosen on the line, or the default.
 */
export function effectiveVatCode(chosen: string | null | undefined, tradeDirection: string, vatPayer: boolean): VatCode {
  if (!vatPayer) return "NP";
  if (isVatCode(chosen) && chosen !== "NP") return chosen;
  return defaultVatCode(tradeDirection);
}

// ── Exchange rates ────────────────────────────────────────────────────────────

/** CZK per 1 unit of the currency; CZK itself is 1. */
export type Rates = Record<string, number>;

export interface RateRow {
  week: string;
  validFrom: string;
  validTo: string;
  rateEur: string | null;
  rateUsd: string | null;
}

export interface PickedRates {
  rates: Rates;
  /** ISO week the rates come from; "" when no rates exist. */
  week: string;
  /** exact = the week of the date; older = closest older week; none = no rates entered */
  source: "exact" | "older" | "newest" | "none";
}

/**
 * Rates valid on a date: the week containing it, else the closest older week, else the
 * newest week. Same rule as the Costs tab, so both show the same numbers.
 */
export function pickRates(rows: RateRow[], dateIso: string): PickedRates {
  if (!rows.length) return { rates: { CZK: 1 }, week: "", source: "none" };
  const sorted = [...rows].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const exact = sorted.find((r) => r.validFrom <= dateIso && dateIso <= r.validTo);
  const older = exact ?? sorted.find((r) => r.validFrom <= dateIso);
  const row = older ?? sorted[0]!;
  const rates: Rates = { CZK: 1 };
  const eur = toNumber(row.rateEur);
  const usd = toNumber(row.rateUsd);
  if (eur > 0) rates.EUR = eur;
  if (usd > 0) rates.USD = usd;
  return { rates, week: row.week, source: exact ? "exact" : older ? "older" : "newest" };
}

function rateOf(currency: string, rates: Rates): number | null {
  if (!currency || currency === "CZK") return 1;
  const r = rates[currency];
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** Shipment dates come as ISO ("2026-10-02") or as the grid's MM/DD/YY(YY). "" if unknown. */
export function parseShipmentDate(raw: string | null | undefined): string {
  const txt = String(raw ?? "").trim();
  if (!txt) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(txt)) return txt.slice(0, 10);
  const m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const year = yy!.length === 2 ? `20${yy}` : yy!;
    return `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }
  const parsed = new Date(txt);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/** DUZP default: ETA for imports, ETD for exports (when the service happens), else today. */
export function defaultDuzp(
  shipment: { tradeDirection: string; estimatedArrival: string | null; estimatedDeparture: string | null },
  today: string,
): string {
  const isExport = (shipment.tradeDirection ?? "").trim().toLowerCase() === "export";
  return parseShipmentDate(isExport ? shipment.estimatedDeparture : shipment.estimatedArrival) || today;
}

/** "14 days" -> 14, "PREPAYMENT" -> 0 (due on issue), anything else -> the default. */
export function dueDays(paymentTerms: string | null | undefined, defaultDays: number): number {
  const t = String(paymentTerms ?? "").trim();
  if (/prepay/i.test(t)) return 0;
  const m = t.match(/(\d{1,3})/);
  return m ? Number(m[1]) : defaultDays;
}

export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ── The invoice ───────────────────────────────────────────────────────────────

export interface SellingRowInput {
  id: string;
  category: string;
  qty: string | null;
  amount: string | null;
  currency: string;
  invoice: boolean;
  vatCode: string | null;
}

export interface InvoiceLineCalc {
  sourceSellingCostId: string;
  description: string;
  qty: number;
  /** Unit price as entered, in its own currency */
  unitPrice: number;
  unitCurrency: string;
  /** Line total in the invoice currency (rounded) */
  net: number;
  vatCode: VatCode;
  vatRate: number;
}

export interface VatSummaryRow {
  vatCode: VatCode;
  vatRate: number;
  base: number;
  vat: number;
  baseCzk: number;
  vatCzk: number;
}

export interface InvoiceCalc {
  currency: string;
  /** CZK per 1 unit of the invoice currency (1 for CZK) */
  fxRate: number;
  lines: InvoiceLineCalc[];
  vatSummary: VatSummaryRow[];
  net: number;
  vat: number;
  gross: number;
  netCzk: number;
  vatCzk: number;
  grossCzk: number;
  /** Currencies without a rate; their rows are left out, so issuing must be blocked. */
  missingCurrencies: string[];
}

export function calculateInvoice(input: {
  rows: SellingRowInput[];
  currency: string;
  rates: Rates;
  tradeDirection: string;
  vatPayer: boolean;
}): InvoiceCalc {
  const { rows, currency, rates, tradeDirection, vatPayer } = input;
  const missing = new Set<string>();
  const billingRate = rateOf(currency, rates);
  if (billingRate === null) missing.add(currency);

  const lines: InvoiceLineCalc[] = [];
  for (const r of rows) {
    if (!r.invoice) continue;
    const qty = toNumber(r.qty) || 1;
    const unitPrice = toNumber(r.amount);
    const from = rateOf(r.currency, rates);
    if (from === null) {
      missing.add(r.currency);
      continue;
    }
    if (billingRate === null) continue;
    const net = round2((unitPrice * qty * from) / billingRate);
    if (net === 0) continue;
    const vatCode = effectiveVatCode(r.vatCode, tradeDirection, vatPayer);
    lines.push({
      sourceSellingCostId: r.id,
      description: r.category || "Service",
      qty,
      unitPrice,
      unitCurrency: r.currency || "CZK",
      net,
      vatCode,
      vatRate: VAT_CODE_INFO[vatCode].rate,
    });
  }

  const fxRate = billingRate ?? 0;
  return { ...summarise(lines, fxRate), currency, fxRate, lines, missingCurrencies: [...missing].sort() };
}

/** VAT recap and totals of a set of lines (also used for credit notes). */
export function summarise(lines: InvoiceLineCalc[], fxRate: number) {
  const byCode = new Map<VatCode, number>();
  for (const l of lines) byCode.set(l.vatCode, round2((byCode.get(l.vatCode) ?? 0) + l.net));

  const vatSummary: VatSummaryRow[] = [...byCode.entries()]
    .sort(([a], [b]) => VAT_CODES.indexOf(a) - VAT_CODES.indexOf(b))
    .map(([vatCode, base]) => {
      const rate = VAT_CODE_INFO[vatCode].rate;
      const baseCzk = round2(base * fxRate);
      return {
        vatCode,
        vatRate: rate,
        base,
        vat: round2((base * rate) / 100),
        baseCzk,
        // VAT for the tax authority is computed from the CZK base (§37 / §4 ZDPH)
        vatCzk: round2((baseCzk * rate) / 100),
      };
    });

  const net = round2(vatSummary.reduce((s, v) => s + v.base, 0));
  const vat = round2(vatSummary.reduce((s, v) => s + v.vat, 0));
  const netCzk = round2(vatSummary.reduce((s, v) => s + v.baseCzk, 0));
  const vatCzk = round2(vatSummary.reduce((s, v) => s + v.vatCzk, 0));
  return { vatSummary, net, vat, gross: round2(net + vat), netCzk, vatCzk, grossCzk: round2(netCzk + vatCzk) };
}

/** Lines of a credit note: the original lines with negative amounts. */
export function creditLines(lines: InvoiceLineCalc[]): InvoiceLineCalc[] {
  return lines.map((l) => ({ ...l, qty: -l.qty, net: round2(-l.net) }));
}
