import { normaliseAmount } from "@/lib/money";

// The MBL's total weight is shown and typed in kg, as the shipments show their weights. The master
// job keeps it in tons, as free text (master_job.total_weight_tons), so it is converted both ways here.

/** The kept tons as kg for the screen ("1.2505" -> "1250.5"); text that is no number stays as it is. */
export function kgFromTons(tons: string | null | undefined): string {
  const text = String(tons ?? "").trim();
  if (text === "") return "";
  const t = Number(text.replace(",", "."));
  return Number.isFinite(t) ? String(Number((t * 1000).toFixed(3))) : text;
}

/** Typed kg as the tons to keep ("1 250,5" -> "1.2505"), "" to clear, or null for text that is no weight. */
export function tonsFromKg(typed: string): string | null {
  const kg = normaliseAmount(typed);
  if (kg === null || kg === "") return kg;
  const n = Number(kg);
  return n < 0 ? null : String(Number((n / 1000).toFixed(6)));
}
