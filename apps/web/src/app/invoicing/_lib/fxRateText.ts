import { formatDate } from "@/lib/date";

/**
 * The ČNB rate an invoice's CZK amounts are counted at, as its PDF prints it: "ČNB rate at the DUZP:
 * 1 EUR = 24.425 CZK (fixing 19.11.2026)". Shown in the Issue dialog, so the rate is seen before it is
 * final (user council B16). "" for a CZK invoice, or while there is no rate yet (issuing is blocked then).
 */
export function fxRateText(p: { currency: string; fxRate: number; fxFixingDate: string | null }): string {
  if (p.currency === "CZK" || !(p.fxRate > 0)) return "";
  const fixing = p.fxFixingDate ? ` (fixing ${formatDate(p.fxFixingDate)})` : "";
  return `ČNB rate at the DUZP: 1 ${p.currency} = ${p.fxRate.toFixed(3)} CZK${fixing}`;
}
