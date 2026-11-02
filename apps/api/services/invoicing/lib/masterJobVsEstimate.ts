import { lineTotalCents } from "./masterJobSplit";

// A master job's buying costs against their estimates, read as profit (Master Jobs → Costs
// Breakdown, "Vs estimate"): real − estimated, so above 0 the cost came out higher than estimated.
// Pure, so it has its test; the service hands it today's ČNB rates.

/** Real − estimated, in `currency`. */
export interface VsEstimate {
  delta: number;
  currency: string;
}

/** A line's comparison, with the same difference in CZK when today's rates give it. */
export interface LineVsEstimate extends VsEstimate {
  czk: number | null;
}

interface ComparedLine {
  estAmount: string | null;
  estQty: string | null;
  estCurrency: string;
  realAmount: string | null;
  realQty: string | null;
  realCurrency: string;
}

const total = (amount: string | null, qty: string | null) => {
  const cents = lineTotalCents(amount, qty);
  return cents == null ? null : cents / 100;
};

/**
 * A line's real cost against its estimate: in the line's currency, or in CZK at today's ČNB rate
 * when the two differ (`czkPer`: CZK per 1 unit, null without a rate). Null until the line has
 * both, or without a rate it needs.
 */
export function lineVsEstimate(line: ComparedLine, czkPer: (currency: string) => number | null): LineVsEstimate | null {
  const est = total(line.estAmount, line.estQty);
  const real = total(line.realAmount, line.realQty);
  if (est == null || real == null) return null;
  const estRate = czkPer(line.estCurrency);
  const realRate = czkPer(line.realCurrency);
  const czk = estRate != null && realRate != null ? real * realRate - est * estRate : null;
  if (line.estCurrency === line.realCurrency) return { delta: real - est, currency: line.realCurrency, czk };
  return czk == null ? null : { delta: czk, currency: "CZK", czk };
}

/** The whole master job against its estimates: in its lines' one currency, else in CZK; null without a comparison, or without a rate. */
export function totalVsEstimate(compared: readonly LineVsEstimate[]): VsEstimate | null {
  if (!compared.length) return null;
  const currency = compared[0]!.currency;
  if (compared.every((v) => v.currency === currency)) return { delta: compared.reduce((a, v) => a + v.delta, 0), currency };
  if (compared.every((v) => v.czk != null)) return { delta: compared.reduce((a, v) => a + v.czk!, 0), currency: "CZK" };
  return null;
}
