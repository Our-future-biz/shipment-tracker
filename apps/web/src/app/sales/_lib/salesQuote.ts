import type { interfaces } from "@/lib/api/client";
import type { SalesQuoteData, CostLine } from "./types";

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

function sumLines(lines: CostLine[] | undefined): number {
  return (lines ?? []).reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
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

export function computeTotals(data: SalesQuoteData) {
  const selling = sumLines(data.sellingLines);
  const buying = sumLines(data.buyingLines);
  const profit = selling - buying;
  const margin = selling ? Math.round((profit / selling) * 100) : 0;
  return { selling, buying, profit, margin };
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
  const date = due.toISOString().slice(0, 10);
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

export function exportQuotesCsv(quotes: SalesQuote[]): void {
  const headers = ["Reference", "Customer", "Service", "Origin", "Destination", "Incoterm", "Status", "Selling", "Profit", "Margin%", "Created"];
  const rows = quotes.map((q) => {
    const t = computeTotals(q.data);
    return [
      q.quoteNumber,
      q.data.customerName ?? "",
      q.data.serviceType ?? "",
      q.data.origin ?? "",
      q.data.destination ?? "",
      q.data.incoterm ?? "",
      q.data.quoteStatus ?? "",
      String(t.selling),
      String(t.profit),
      String(t.margin),
      q.createdAt?.slice(0, 10) ?? "",
    ];
  });
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
