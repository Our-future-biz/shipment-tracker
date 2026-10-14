import type { interfaces } from "@/lib/api/client";
import type { SalesQuoteData, CostLine, QuoteFx } from "./types";

export interface SalesQuote {
  quoteNumber: string;
  createdAt: string;
  data: SalesQuoteData;
}

export function asData(d: unknown): SalesQuoteData {
  return d && typeof d === "object" ? (d as SalesQuoteData) : {};
}

export function toSalesQuote(q: interfaces.QuoteItem): SalesQuote {
  return { quoteNumber: q.quoteNumber, createdAt: q.createdAt, data: asData(q.data) };
}

// A quote row belongs to the Sales module when it carries a lifecycle status.
export function isSalesQuote(q: interfaces.QuoteItem): boolean {
  return !!asData(q.data).quoteStatus;
}

// Duplicates branch off their base reference as QCZ…-2, -3, …; together they
// form a "family" of variants (e.g. an AIR and a SEA option for one enquiry).
export function baseRef(ref: string): string {
  return ref.replace(/-\d+$/, "");
}

export function quoteFamily(quotes: SalesQuote[], ref: string): SalesQuote[] {
  const base = baseRef(ref);
  const suffix = (q: SalesQuote) =>
    q.quoteNumber === base ? 1 : parseInt(q.quoteNumber.slice(base.length + 1), 10) || 1;
  return quotes
    .filter((q) => baseRef(q.quoteNumber) === base)
    .sort((a, b) => suffix(a) - suffix(b));
}

// CZK per 1 unit; CZK itself is 1. null when the rate is not known.
function rateOf(currency: string, rates: Record<string, number> | undefined): number | null {
  if (currency === "CZK") return 1;
  const r = rates?.[currency];
  return typeof r === "number" && r > 0 ? r : null;
}

/**
 * Adds up lines in the quote currency. A line in another currency is converted through CZK
 * at the ČNB rate; selling lines also get the company ROE % (a sell price made in another
 * currency carries the FX buffer), buying lines never do. A line whose rate is unknown is
 * left out — never counted at 1 — and its currency reported.
 */
function sumLines(lines: CostLine[] | undefined, quoteCurrency: string, fx: QuoteFx | undefined, selling: boolean) {
  let total = 0;
  const unconverted = new Set<string>();
  for (const l of lines ?? []) {
    const amount = Number(l.amount) || 0;
    const from = l.currency || quoteCurrency;
    if (from === quoteCurrency) {
      total += amount;
      continue;
    }
    const rFrom = rateOf(from, fx?.rates);
    const rTo = rateOf(quoteCurrency, fx?.rates);
    if (rFrom == null || rTo == null) {
      if (amount) unconverted.add(from);
      continue;
    }
    const converted = (amount * rFrom) / rTo;
    total += selling ? converted * ((fx?.roePct ?? 100) / 100) : converted;
  }
  return { total, unconverted };
}

// Freight cargo metrics from the package lines. Volumetric weight uses the
// standard air divisor of 6000 (cm³ → kg); chargeable weight is max(gross, volumetric).
export function computeCargo(data: SalesQuoteData) {
  const pkgs = data.packages ?? [];
  const n = (v: unknown) => Number(v) || 0;
  const totalPackages = pkgs.reduce((s, p) => s + n(p.qty), 0);
  const grossWeight = pkgs.reduce((s, p) => s + n(p.qty) * n(p.weight), 0);
  const cbm = pkgs.reduce((s, p) => s + (n(p.qty) * n(p.length) * n(p.width) * n(p.height)) / 1_000_000, 0);
  const volumetricWeight = pkgs.reduce((s, p) => s + (n(p.qty) * n(p.length) * n(p.width) * n(p.height)) / 6000, 0);
  return {
    totalPackages,
    grossWeight: Math.round(grossWeight * 100) / 100,
    cbm: Math.round(cbm * 1000) / 1000,
    volumetricWeight: Math.round(volumetricWeight * 100) / 100,
    chargeableWeight: Math.round(Math.max(grossWeight, volumetricWeight) * 100) / 100,
  };
}

/**
 * Quote totals in the quote's own currency. A sent quote uses the rates stored on it; a
 * draft uses `liveFx` (today's ČNB rates and ROE %, from useQuoteFx).
 */
export function computeTotals(data: SalesQuoteData, liveFx?: QuoteFx | null) {
  const currency = data.currency || "EUR";
  const fx = data.fx ?? liveFx ?? undefined;
  const sell = sumLines(data.sellingLines, currency, fx, true);
  const buy = sumLines(data.buyingLines, currency, fx, false);
  const selling = sell.total;
  const buying = buy.total;
  const profit = selling - buying;
  const margin = selling ? Math.round((profit / selling) * 100) : 0;
  const unconverted = [...new Set([...sell.unconverted, ...buy.unconverted])].sort();
  return { selling, buying, profit, margin, unconverted, fx: fx ?? null, fxLocked: !!data.fx };
}

function czDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

// One line saying which rates a quote's totals use — for the people pricing it.
export function fxNote(totals: ReturnType<typeof computeTotals>, currency: string): string {
  if (!totals.fx) return `Totals in ${currency}. Loading today's ČNB rates…`;
  const roe = totals.fx.roePct !== 100 ? ` · selling lines in another currency × ROE ${totals.fx.roePct} %` : "";
  return totals.fxLocked
    ? `Totals in ${currency} at the ČNB rates of ${czDate(totals.fx.fixingDate)}${roe} — stored when the quote was sent ${czDate(totals.fx.lockedAt)}.`
    : `Totals in ${currency} at today's ČNB rates (${czDate(totals.fx.fixingDate)})${roe} — stored on the quote when it is sent.`;
}

// The clause for the client PDF when foreign-currency charges were converted.
export function fxClause(data: SalesQuoteData, fx: QuoteFx | null): string {
  const currency = data.currency || "EUR";
  const foreign = (data.sellingLines ?? []).some((l) => (l.currency || currency) !== currency);
  if (!foreign || !fx) return "";
  const buffer = fx.roePct !== 100 ? ` (+${Math.round((fx.roePct - 100) * 1000) / 1000} %)` : "";
  return `Charges in other currencies converted to ${currency} at the ČNB rate of ${czDate(fx.fixingDate)}${buffer}. Rates subject to ROE fluctuation; final amounts at the ČNB rate on the invoice date.`;
}

export function validityInfo(data: SalesQuoteData): { date: string | null; expired: boolean } {
  // Prefer an explicitly picked expiry date; fall back to sentAt + validityDays for older quotes.
  if (data.validUntil) {
    const due = new Date(`${data.validUntil}T23:59:59`);
    return { date: data.validUntil, expired: due.getTime() < Date.now() };
  }
  if (!data.sentAt || !data.validityDays) return { date: null, expired: false };
  const sent = new Date(data.sentAt);
  const due = new Date(sent.getTime() + data.validityDays * 86400000);
  // The day on the viewer's calendar: toISOString() would give the UTC day, one early for a quote sent after midnight in CET.
  const date = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  return { date, expired: due.getTime() < Date.now() };
}

export function daysOpen(data: SalesQuoteData): number | null {
  if (!data.sentAt) return null;
  return Math.floor((Date.now() - new Date(data.sentAt).getTime()) / 86400000);
}

export function needsFollowUp(data: SalesQuoteData): boolean {
  if (data.quoteStatus !== "quoted" && data.quoteStatus !== "feedback") return false;
  const d = daysOpen(data);
  return d != null && d >= 3;
}

export function fmt(n: number, currency = "EUR"): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
}

export interface CsvColumn {
  title: string;
  accessor: (q: SalesQuote) => string;
}

// Without an explicit column set, exports the default summary columns;
// Quote History passes its active (visible + ordered) columns instead.
export function exportQuotesCsv(quotes: SalesQuote[], columns?: CsvColumn[], liveFx?: QuoteFx | null): void {
  const cols: CsvColumn[] = columns ?? [
    { title: "Sales Number", accessor: (q) => q.quoteNumber },
    { title: "Customer", accessor: (q) => q.data.customerName ?? "" },
    { title: "Freight Mode", accessor: (q) => q.data.serviceType ?? "" },
    { title: "Origin", accessor: (q) => q.data.origin ?? "" },
    { title: "Destination", accessor: (q) => q.data.destination ?? "" },
    { title: "Incoterm", accessor: (q) => q.data.incoterm ?? "" },
    { title: "Quote Status", accessor: (q) => q.data.quoteStatus ?? "" },
    { title: "Total Selling Costs", accessor: (q) => String(computeTotals(q.data, liveFx).selling) },
    { title: "Profit", accessor: (q) => String(computeTotals(q.data, liveFx).profit) },
    { title: "Margin%", accessor: (q) => String(computeTotals(q.data, liveFx).margin) },
    { title: "Created Date", accessor: (q) => q.createdAt?.slice(0, 10) ?? "" },
  ];
  const headers = cols.map((c) => c.title);
  const rows = quotes.map((q) => cols.map((c) => c.accessor(q)));
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quotes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
