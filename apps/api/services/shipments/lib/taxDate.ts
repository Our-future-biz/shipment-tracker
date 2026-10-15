// A job's tax date (DUZP) is its ATA for an import and its ATD for an export (owner
// decision, 14 Oct 2026). Once the job is invoiced the tax date is final: correct it by
// crediting the invoice first. Pure, so it is unit-tested.

export interface TaxDateFields {
  tradeDirection?: string | null;
  actualArrival?: string | null;
  actualDeparture?: string | null;
}

const TAX_FIELDS = ["actualArrival", "actualDeparture", "tradeDirection"] as const;

/** The date the job is taxed by: ATD for an export, ATA otherwise (blank direction = import). */
export function taxDateOf(s: TaxDateFields): string | null {
  const exp = (s.tradeDirection ?? "").trim().toLowerCase() === "export";
  return (exp ? s.actualDeparture : s.actualArrival) || null;
}

/**
 * Whether writing `changes` onto `before` touches what an invoice fixed: ATA or ATD
 * themselves, or the trade direction when that switches which of them is the tax date.
 */
export function changesTaxDate(before: TaxDateFields, changes: TaxDateFields): boolean {
  const after: TaxDateFields = { ...before };
  for (const key of TAX_FIELDS) if (key in changes) after[key] = changes[key] ?? null;
  const datesMoved = (["actualArrival", "actualDeparture"] as const).some((k) => (after[k] ?? null) !== (before[k] ?? null));
  return datesMoved || taxDateOf(after) !== taxDateOf(before);
}
