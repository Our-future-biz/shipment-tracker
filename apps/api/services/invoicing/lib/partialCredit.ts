import { round2, summarise, toNumber, type InvoiceLineCalc, type StoredTotals, type VatSummaryRow } from "./invoiceCalc";
import type { VatCode } from "../interfaces/interfaces";

/**
 * Partial credit notes (owner's decision, 17 Nov 2026). An invoice can be credited in part, line by
 * line: each line by its whole amount or less. A partial credit note is asked for with a reason and
 * issued once a manager approves it (Sales → Managers → Billing approvals); the invoice stays issued
 * with the rest. A full credit note stays instant and, after partial ones, reverses only what is left.
 * Each credit note line names the invoice line it corrects (correctsLineId), so what is left of a line
 * is its amount less what its credit note lines took.
 *
 * Amounts are asked in the line's own currency (the selling row's), as qty × unit price; the invoice
 * currency follows by the line's own rate, so the credit uses the rate of the original supply (§42 ZDPH).
 */

/** An invoice line or a credit note line as stored (numeric columns arrive as strings). */
export interface StoredLine {
  id: string;
  description: string;
  qty: string | number;
  unitPrice: string | number;
  unitCurrency: string;
  net: string | number;
  vatCode: VatCode;
  vatRate: string | number;
  fxRate: string | number | null;
  sourceSellingCostId: string | null;
  correctsLineId?: string | null;
}

/** What is left of an invoice line after the credit notes issued against it. */
export interface RemainingLine {
  lineId: string;
  description: string;
  qty: number;
  unitPrice: number;
  unitCurrency: string;
  fxRate: number;
  vatCode: VatCode;
  vatRate: number;
  sourceSellingCostId: string | null;
  /** The line's amount in its own currency (qty × unit price) */
  amount: number;
  /** What is left of it to credit, in its own currency */
  remainingAmount: number;
  /** The line's total in the invoice currency */
  net: number;
  /** What is left of it, in the invoice currency */
  remainingNet: number;
}

/** A credit note line, with the invoice line it corrects. */
export type CreditLineCalc = InvoiceLineCalc & { correctsLineId: string };

const cents = (v: number) => Math.round(v * 100);

/** Each invoice line with what is left of it after these credit note lines. */
export function remainingLines(invoiceLines: StoredLine[], creditNoteLines: StoredLine[]): RemainingLine[] {
  return invoiceLines.map((l) => {
    const qty = toNumber(l.qty);
    const unitPrice = toNumber(l.unitPrice);
    const amount = round2(qty * unitPrice);
    const net = round2(toNumber(l.net));
    const against = creditNoteLines.filter((c) => c.correctsLineId === l.id);
    // credit note lines are negative
    const creditedAmount = against.reduce((s, c) => s + toNumber(c.qty) * toNumber(c.unitPrice), 0);
    const creditedNet = against.reduce((s, c) => s + toNumber(c.net), 0);
    return {
      lineId: l.id,
      description: l.description,
      qty,
      unitPrice,
      unitCurrency: l.unitCurrency,
      fxRate: l.fxRate == null ? 1 : toNumber(l.fxRate),
      vatCode: l.vatCode,
      vatRate: toNumber(l.vatRate),
      sourceSellingCostId: l.sourceSellingCostId,
      amount,
      remainingAmount: round2(amount + creditedAmount),
      net,
      remainingNet: round2(net + creditedNet),
    };
  });
}

export interface AskedLine {
  lineId: string;
  /** What to credit of the line, in its own currency */
  amount: string | number;
}

/**
 * The lines of a partial credit note: one per asked line, for the amount asked (in the line's own
 * currency). A line credited to its end takes exactly what is left of its net, so nothing is left
 * over by rounding. Throws nothing: a problem comes back as words for the user.
 */
export function partialCreditLines(remaining: RemainingLine[], asked: AskedLine[]): { lines: CreditLineCalc[] } | { problem: string } {
  if (!asked.length) return { problem: "Pick at least one line to credit" };
  const seen = new Set<string>();
  const lines: CreditLineCalc[] = [];
  for (const a of asked) {
    const line = remaining.find((r) => r.lineId === a.lineId);
    if (!line) return { problem: "A line to credit is not on this invoice" };
    if (seen.has(a.lineId)) return { problem: `"${line.description}" is picked twice` };
    seen.add(a.lineId);
    const raw = typeof a.amount === "number" ? a.amount : Number(String(a.amount).trim().replace(",", "."));
    if (!Number.isFinite(raw) || raw <= 0) return { problem: `Enter the amount to credit of "${line.description}"` };
    if (Math.abs(cents(raw) - raw * 100) > 1e-6) return { problem: `The amount to credit of "${line.description}" has more than two decimals` };
    if (cents(raw) > cents(line.remainingAmount)) {
      return { problem: `"${line.description}" has ${line.remainingAmount.toFixed(2)} ${line.unitCurrency} left to credit` };
    }
    const toEnd = cents(raw) === cents(line.remainingAmount);
    lines.push({
      sourceSellingCostId: line.sourceSellingCostId ?? "",
      description: line.description,
      qty: -1,
      unitPrice: raw,
      unitCurrency: line.unitCurrency,
      net: toEnd ? round2(-line.remainingNet) : round2(-raw * line.fxRate),
      vatCode: line.vatCode,
      vatRate: line.vatRate,
      fxRate: line.fxRate,
      correctsLineId: line.lineId,
    });
  }
  if (lines.every((l) => l.net === 0)) return { problem: "The amounts to credit come to nothing in the invoice currency" };
  return { lines };
}

/** Totals of a partial credit note: summed from its lines, as an invoice's are. */
export const partialCreditTotals = (lines: InvoiceLineCalc[], invoiceFxRate: number) => summarise(lines, invoiceFxRate);

/** Whether the invoice would be credited to its end by these lines (every line to nothing). */
export function creditsEverything(remaining: RemainingLine[], lines: CreditLineCalc[]): boolean {
  return remaining.every((r) => {
    const credit = lines.find((l) => l.correctsLineId === r.lineId);
    return cents(r.remainingNet) + cents(credit?.net ?? 0) === 0 && cents(r.remainingAmount) - cents(credit ? credit.unitPrice : 0) === 0;
  });
}

/**
 * The lines of a full credit note: what is left of every line, negated. A line nothing was taken
 * from keeps its quantity and unit price, as before partial credits; one credited in part goes as
 * one unit of what is left.
 */
export function fullCreditLines(remaining: RemainingLine[]): CreditLineCalc[] {
  return remaining
    .filter((r) => cents(r.remainingNet) !== 0 || cents(r.remainingAmount) !== 0)
    .map((r) => {
      const untouched = cents(r.remainingAmount) === cents(r.amount) && cents(r.remainingNet) === cents(r.net);
      return {
        sourceSellingCostId: r.sourceSellingCostId ?? "",
        description: r.description,
        qty: untouched ? -r.qty : -1,
        unitPrice: untouched ? r.unitPrice : r.remainingAmount,
        unitCurrency: r.unitCurrency,
        net: round2(-r.remainingNet),
        vatCode: r.vatCode,
        vatRate: r.vatRate,
        fxRate: r.fxRate,
        correctsLineId: r.lineId,
      };
    });
}

/**
 * Totals of the full credit note of an invoice already credited in part: what is left of the
 * invoice's own stored totals (its totals plus those of the credit notes, which are negative),
 * negated - so the invoice and all its credit notes come to exactly nothing.
 */
export function fullCreditTotalsAfter(original: StoredTotals, credits: StoredTotals[]) {
  const sum = (pick: (t: StoredTotals) => string | number) => round2(-(toNumber(pick(original)) + credits.reduce((s, c) => s + toNumber(pick(c)), 0)));
  const byCode = new Map<string, VatSummaryRow>();
  for (const row of [...original.vatSummary, ...credits.flatMap((c) => c.vatSummary)]) {
    const seen = byCode.get(row.vatCode);
    if (!seen) byCode.set(row.vatCode, { ...row, base: toNumber(row.base), vat: toNumber(row.vat), baseCzk: toNumber(row.baseCzk), vatCzk: toNumber(row.vatCzk) });
    else {
      seen.base += toNumber(row.base);
      seen.vat += toNumber(row.vat);
      seen.baseCzk += toNumber(row.baseCzk);
      seen.vatCzk += toNumber(row.vatCzk);
    }
  }
  const order = original.vatSummary.map((r) => r.vatCode);
  const vatSummary = [...byCode.values()]
    .sort((a, b) => order.indexOf(a.vatCode) - order.indexOf(b.vatCode))
    .map((r) => ({ vatCode: r.vatCode, vatRate: r.vatRate, base: round2(-r.base), vat: round2(-r.vat), baseCzk: round2(-r.baseCzk), vatCzk: round2(-r.vatCzk) }))
    .filter((r) => r.base !== 0 || r.vat !== 0 || r.baseCzk !== 0 || r.vatCzk !== 0);
  return {
    vatSummary,
    net: sum((t) => t.net),
    vat: sum((t) => t.vat),
    gross: sum((t) => t.gross),
    netCzk: sum((t) => t.netCzk),
    vatCzk: sum((t) => t.vatCzk),
    grossCzk: sum((t) => t.grossCzk),
  };
}

export const WHOLE_INVOICE = "This credits the whole invoice: credit the whole invoice instead - that needs no approval";

/**
 * The lines of a partial credit note as asked, or why it can't be one: a bad line or amount, or
 * one that would credit the whole invoice (a full credit note does that, at once and without approval).
 */
export function planPartialCredit(remaining: RemainingLine[], asked: AskedLine[]): { lines: CreditLineCalc[] } | { problem: string } {
  const plan = partialCreditLines(remaining, asked);
  if ("problem" in plan) return plan;
  if (creditsEverything(remaining, plan.lines)) return { problem: WHOLE_INVOICE };
  return plan;
}
