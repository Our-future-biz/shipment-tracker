import type { VatCode } from "../interfaces/interfaces";

/**
 * The invoice maths, done on the server from stored data only (never from numbers the
 * browser sends). Pure functions, so every rule is covered by unit tests.
 *
 *  - lines = selling rows ticked for Invoice, converted into the invoice currency by
 *    their own currency at the ČNB rate valid on the DUZP (CZK per 1 unit); a line in
 *    another currency than the invoice also gets the company ROE % (commercial rate)
 *  - the CZK tax amounts use the raw ČNB rate of the invoice currency on the DUZP
 *    (§4 odst. 8 ZDPH) — never the ROE-adjusted one
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

/**
 * The quantity of a cost / selling row: a blank quantity means 1 (a lump sum), but a 0 typed
 * on purpose stays 0 — that row then adds nothing, it is not billed as one unit.
 */
export function qtyOrOne(v: string | number | null | undefined): number {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 1;
  return toNumber(v);
}

// ── VAT ───────────────────────────────────────────────────────────────────────

export type { VatCode };

export const VAT_CODES = ["S21", "Z69", "RC", "OUT", "NP"] as const satisfies readonly VatCode[];

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

/**
 * DUZP default = the tax date (owner decision, 14 Oct 2026): ATA for imports, ATD for
 * exports; until that is known ETA / ETD; else today.
 */
export function defaultDuzp(
  shipment: {
    tradeDirection: string;
    estimatedArrival: string | null;
    estimatedDeparture: string | null;
    actualArrival?: string | null;
    actualDeparture?: string | null;
  },
  today: string,
): string {
  const isExport = (shipment.tradeDirection ?? "").trim().toLowerCase() === "export";
  const actual = parseShipmentDate(isExport ? shipment.actualDeparture : shipment.actualArrival);
  return actual || parseShipmentDate(isExport ? shipment.estimatedDeparture : shipment.estimatedArrival) || today;
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
  /** "Invoice text" column: what the customer reads on the line; empty = the category */
  invoiceText?: string | null;
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
  /** Invoice-currency units per 1 unit_currency (ČNB cross rate × ROE %); 1 for the same currency */
  fxRate: number;
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
  /** ČNB rates valid on the DUZP, CZK per 1 unit */
  rates: Rates;
  /** Company ROE % in force on the DUZP; 100 = pure ČNB */
  roePct?: number;
  tradeDirection: string;
  vatPayer: boolean;
}): InvoiceCalc {
  const { rows, currency, rates, tradeDirection, vatPayer } = input;
  const roe = (input.roePct ?? 100) / 100;
  const missing = new Set<string>();
  const billingRate = rateOf(currency, rates);
  if (billingRate === null) missing.add(currency);

  const lines: InvoiceLineCalc[] = [];
  for (const r of rows) {
    if (!r.invoice) continue;
    const qty = qtyOrOne(r.qty);
    const unitPrice = toNumber(r.amount);
    const from = rateOf(r.currency, rates);
    if (from === null) {
      missing.add(r.currency);
      continue;
    }
    if (billingRate === null) continue;
    // A sell price turned into another currency carries the ROE buffer; the same currency never does.
    const lineFx = (r.currency || "CZK") === currency ? 1 : (from / billingRate) * roe;
    const net = round2(unitPrice * qty * lineFx);
    if (net === 0) continue;
    const vatCode = effectiveVatCode(r.vatCode, tradeDirection, vatPayer);
    lines.push({
      sourceSellingCostId: r.id,
      description: r.invoiceText?.trim() || r.category || "Service",
      qty,
      unitPrice,
      unitCurrency: r.currency || "CZK",
      net,
      vatCode,
      vatRate: VAT_CODE_INFO[vatCode].rate,
      fxRate: Math.round(lineFx * 1e6) / 1e6,
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

/** Totals of an issued document, as stored (numeric columns arrive as strings). */
export interface StoredTotals {
  net: string | number;
  vat: string | number;
  gross: string | number;
  netCzk: string | number;
  vatCzk: string | number;
  grossCzk: string | number;
  vatSummary: VatSummaryRow[];
}

/**
 * Totals of a credit note that reverses the whole invoice: the invoice's own stored totals
 * and VAT recap with the sign flipped. Recomputing them from the stored per-line rates could
 * differ by a few haléře from what the invoice said, so the credit note would not cancel it.
 */
export function creditTotals(original: StoredTotals) {
  const neg = (v: string | number) => round2(-toNumber(v));
  return {
    vatSummary: original.vatSummary.map((r) => ({
      vatCode: r.vatCode,
      vatRate: r.vatRate,
      base: neg(r.base),
      vat: neg(r.vat),
      baseCzk: neg(r.baseCzk),
      vatCzk: neg(r.vatCzk),
    })),
    net: neg(original.net),
    vat: neg(original.vat),
    gross: neg(original.gross),
    netCzk: neg(original.netCzk),
    vatCzk: neg(original.vatCzk),
    grossCzk: neg(original.grossCzk),
  };
}
