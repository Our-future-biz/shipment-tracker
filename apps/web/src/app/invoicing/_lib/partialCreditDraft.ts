import type { interfaces } from "@/lib/api/client";

export type CreditMode = "whole" | "part";

type Line = Pick<interfaces.CreditableLineItem, "lineId" | "remainingAmount" | "remainingNet" | "fxRate" | "vatRate" | "unitCurrency">;

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const cents = (v: number) => Math.round(v * 100);

export interface PartialCreditDraft {
  /** Per picked line: its net in the invoice currency (an estimate until issued), or why the amount is refused */
  rows: Record<string, { net: number; problem: string | null }>;
  /** The lines as the API takes them, once every picked amount is valid */
  lines: { lineId: string; amount: string }[];
  ok: boolean;
  /** Every line credited to its end: a credit of the whole invoice, which needs no approval */
  wholeInvoice: boolean;
  /** It takes more than is left of the invoice (possible with a line below zero, a discount): `left` says how much is */
  overInvoice: boolean;
  /** What is left of the invoice to credit, without VAT, in the invoice currency */
  left: number;
  net: number;
  vat: number;
  gross: number;
}

/**
 * What the picked lines of a partial credit note come to, as the API works it out
 * (lib/partialCredit): each amount in the line's own currency, at the line's own rate; a line
 * credited to its end takes exactly what is left of its net. VAT is an estimate: the credit note
 * sums it per VAT code.
 */
export function partialCreditDraft(lines: readonly Line[], picked: Readonly<Record<string, string>>): PartialCreditDraft {
  const rows: PartialCreditDraft["rows"] = {};
  const out: PartialCreditDraft["lines"] = [];
  let net = 0;
  let vat = 0;
  let toEnd = 0;
  for (const l of lines) {
    if (!(l.lineId in picked)) continue;
    const text = (picked[l.lineId] ?? "").trim().replace(",", ".");
    const amount = Number(text);
    let problem: string | null = null;
    if (!text || !Number.isFinite(amount) || amount <= 0) problem = "Enter an amount";
    else if (Math.abs(cents(amount) - amount * 100) > 1e-6) problem = "Two decimals at most";
    else if (cents(amount) > cents(l.remainingAmount)) problem = `${l.remainingAmount.toFixed(2)} ${l.unitCurrency} left`;
    const end = !problem && cents(amount) === cents(l.remainingAmount);
    const lineNet = problem ? 0 : end ? l.remainingNet : round2(amount * l.fxRate);
    rows[l.lineId] = { net: lineNet, problem };
    if (problem) continue;
    if (end) toEnd += 1;
    out.push({ lineId: l.lineId, amount: amount.toFixed(2) });
    net += lineNet;
    vat += round2((lineNet * l.vatRate) / 100);
  }
  const creditable = lines.filter((l) => cents(l.remainingAmount) > 0).length;
  const problems = Object.values(rows).some((r) => r.problem);
  net = round2(net);
  vat = round2(vat);
  // As the API: what is left of the invoice after this credit, all its lines counted (one below zero too).
  const leftCents = lines.reduce((s, l) => s + cents(l.remainingNet), 0);
  const after = leftCents - cents(net);
  const wholeInvoice = !problems && out.length > 0 && ((creditable > 0 && toEnd === creditable) || after === 0);
  const overInvoice = !problems && !wholeInvoice && out.length > 0 && after < 0;
  return {
    rows,
    lines: out,
    ok: out.length > 0 && !problems && !wholeInvoice && !overInvoice,
    wholeInvoice,
    overInvoice,
    left: leftCents / 100,
    net,
    vat,
    gross: round2(net + vat),
  };
}
