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

// ── A credit owed by Trucking (mock test council Y1 / P1) ──

/**
 * A selling line below nothing on no document billing it: a credit owed - a Trucking difference line (a price
 * lowered after the invoice), or a line entered below nothing, a discount added late.
 */
export interface OpenCreditDiff {
  id: string;
  /** The row's Trucking ref ("<set>:diff:<n>" for a difference line); null for a row kept by hand. */
  ref: string | null;
  currency: string;
  /** What the line comes to (below nothing), in its own currency */
  amount: number;
  /** When it was last changed (ms): issuing checks it again under the shipment's lock. */
  version: number;
}

/** What a partial credit note writes besides its lines when it settles credits owed by Trucking. */
export interface SettledCredit {
  /** The credit note's lines, each with the selling row it bills: a difference line it settles, or a negative row of its own. */
  lines: CreditLineCalc[];
  /** The lines that put a negative row of their own on the shipment (the row's id is the line's source), as before. */
  ownRows: CreditLineCalc[];
  /** The difference lines settled in part: each comes down to what was credited of it (positive). */
  shrink: { id: string; amount: number }[];
  /**
   * What is left owed of a difference line settled in part (positive): it stays a difference line of its own, written
   * under `id` - a later line of the same credit note may settle it (m8), and then bills that row.
   */
  rest: { fromId: string; amount: number; id: string }[];
  /** The difference lines the credit note settles. */
  settled: OpenCreditDiff[];
}

/**
 * How a partial credit note gives a credit owed (Y1 / P1). A credited line settles the open lines below
 * nothing `diffsOf` names for its row, in that order and in its currency - first the difference line of
 * its own Trucking set whose price was lowered after the invoice (the "Price change after invoice −50"),
 * then any other credit the job is owed (truckingLinesRepository openCreditDiffs): the line bills that row
 * instead of putting a negative row of its own on the shipment, so the selling drops once, by the credit -
 * not by the line below nothing and the credit again - and the job's credit owed is given.
 * Credited exactly what is owed: the line settles it. Less: it settles that much, and the rest stays
 * owed as a line of its own. More: the line is split - what is owed settles the line below nothing (or
 * the next one, in turn), the rest is a credit of its own, as before, and the nets come from the line's
 * so the total is the same. Lines whose row has nothing owed put a negative row of their own on the
 * shipment (`newId`). Two lines settle one credit owed in turn (m8): what an earlier line left owed of it
 * (its rest) is settled by the next line, as the line itself would be.
 */
export function settleTruckingCredit(lines: CreditLineCalc[], diffsOf: (sourceRowId: string | null) => readonly OpenCreditDiff[], newId: () => string): SettledCredit {
  const out: SettledCredit = { lines: [], ownRows: [], shrink: [], rest: [], settled: [] };
  // Per line owed: the row that holds what is still owed of it (the line itself, else its rest), and how much (cents).
  const left = new Map<string, { holder: string; owed: number; rest: SettledCredit["rest"][number] | null }>();
  const own = (line: CreditLineCalc) => {
    const row = { ...line, sourceSellingCostId: newId() };
    out.lines.push(row);
    out.ownRows.push(row);
  };
  for (const line of lines) {
    let credit = cents(line.unitPrice);
    // What of the line settles which credit owed: each part bills the row that holds it.
    const parts: { holder: string; amount: number }[] = [];
    for (const diff of diffsOf(line.sourceSellingCostId || null)) {
      if (credit <= 0) break;
      if (diff.currency !== line.unitCurrency || cents(diff.amount) >= 0) continue;
      const state = left.get(diff.id) ?? { holder: diff.id, owed: -cents(diff.amount), rest: null };
      if (state.owed <= 0) continue;
      if (!left.has(diff.id)) out.settled.push(diff);
      const settled = Math.min(credit, state.owed);
      parts.push({ holder: state.holder, amount: settled });
      credit -= settled;
      if (settled === state.owed) {
        left.set(diff.id, { ...state, owed: 0 });
        continue;
      }
      // The holder comes down to what this line credits of it, and what is left is owed on a row of its own.
      if (state.rest) state.rest.amount = settled / 100;
      else out.shrink.push({ id: diff.id, amount: settled / 100 });
      const rest = { fromId: diff.id, amount: (state.owed - settled) / 100, id: newId() };
      out.rest.push(rest);
      left.set(diff.id, { holder: rest.id, owed: state.owed - settled, rest });
    }
    if (!parts.length) {
      own(line);
      continue;
    }
    // Each part's net by the line's rate; the last part (or the credit of its own beyond what was owed) takes what is
    // left of the line's, so the total is the line's.
    let net = line.net;
    for (const [i, part] of parts.entries()) {
      const last = i === parts.length - 1 && credit === 0;
      const partNet = last ? round2(net) : round2((-part.amount / 100) * line.fxRate);
      net = round2(net - partNet);
      out.lines.push({ ...line, unitPrice: part.amount / 100, net: partNet, sourceSellingCostId: part.holder });
    }
    if (credit > 0) own({ ...line, unitPrice: credit / 100, net });
  }
  return out;
}

/**
 * Whether the credits owed read for a partial credit note are still what they are: the same lines (each
 * unchanged) for every credited row. Issuing reads them again under the shipment's lock, whatever the
 * first read found - a push or a line entered meanwhile may have made a credit owed the note must settle.
 */
export function sameCreditsOwed(before: ReadonlyMap<string, readonly OpenCreditDiff[]>, now: ReadonlyMap<string, readonly OpenCreditDiff[]>): boolean {
  const key = (m: ReadonlyMap<string, readonly OpenCreditDiff[]>) =>
    JSON.stringify([...m].filter(([, list]) => list.length).sort(([a], [b]) => a.localeCompare(b)).map(([row, list]) => [row, list.map((d) => [d.id, d.version])]));
  return key(before) === key(now);
}

export const WHOLE_INVOICE ="This credits the whole invoice: credit the whole invoice instead - that needs no approval";

/** Whether every line that has something left to credit is credited to its end (a line below zero, a discount, can't be picked). */
function creditableToTheirEnd(remaining: RemainingLine[], lines: CreditLineCalc[]): boolean {
  return remaining
    .filter((r) => cents(r.remainingAmount) > 0)
    .every((r) => {
      const credit = lines.find((l) => l.correctsLineId === r.lineId);
      return !!credit && cents(credit.unitPrice) === cents(r.remainingAmount);
    });
}

/**
 * The lines of a partial credit note as asked, or why it can't be one: a bad line or amount, one that
 * would credit the whole invoice (a full credit note does that, at once and without approval), or one
 * that would take more than is left of the invoice. Each line is checked against itself only, so with a
 * line below zero (a discount) the lines alone could credit more than the invoice is worth.
 */
export function planPartialCredit(remaining: RemainingLine[], asked: AskedLine[]): { lines: CreditLineCalc[] } | { problem: string } {
  const plan = partialCreditLines(remaining, asked);
  if ("problem" in plan) return plan;
  if (creditsEverything(remaining, plan.lines) || creditableToTheirEnd(remaining, plan.lines)) return { problem: WHOLE_INVOICE };
  const left = remaining.reduce((s, r) => s + cents(r.remainingNet), 0);
  const after = left + plan.lines.reduce((s, l) => s + cents(l.net), 0);
  if (after === 0) return { problem: WHOLE_INVOICE };
  if (after < 0) {
    return { problem: `This credits more than is left of the invoice (${(left / 100).toFixed(2)} without VAT): credit less, or credit the whole invoice instead` };
  }
  return plan;
}
