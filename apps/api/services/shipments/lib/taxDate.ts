// A job's tax date (DUZP) is its ATA for an import and its ATD for an export (owner decision,
// 14 Oct 2026), its delivery for a job dated by its delivery. Once the job is invoiced the tax date
// is final: correct it by crediting the invoice first. Pure, so it is unit-tested.
//
// Which day is the ATA when a source gives a time (Council Outlay 8, D5): the port's local calendar
// day of the vessel's arrival at the POD. Discharge and gate-out are not it. Our own stamps (gate,
// delivery) take the Prague day.

import { isDeliveryDated } from "../../../lib/deliveryDated";

export interface TaxDateFields {
  tradeDirection?: string | null;
  actualArrival?: string | null;
  actualDeparture?: string | null;
  department?: string | null;
  actualDeliveryDate?: string | null;
  plannedDeliveryDate?: string | null;
}

const TAX_FIELDS = ["actualArrival", "actualDeparture", "tradeDirection", "department", "actualDeliveryDate", "plannedDeliveryDate"] as const;

/** The date the job is taxed by: ATD for an export, ATA otherwise (blank direction = import). */
export function taxDateOf(s: TaxDateFields): string | null {
  const exp = (s.tradeDirection ?? "").trim().toLowerCase() === "export";
  return (exp ? s.actualDeparture : s.actualArrival) || null;
}

/** What a job dated by its delivery is taxed by: the delivery, the planned one until then. Null for any other job. */
function deliveryBasisOf(s: TaxDateFields): string | null {
  if (!isDeliveryDated({ tradeDirection: s.tradeDirection ?? "", department: s.department })) return null;
  return s.actualDeliveryDate || s.plannedDeliveryDate || null;
}

/**
 * Whether writing `changes` onto `before` touches what an invoice fixed: ATA or ATD themselves, the
 * delivery date of a job dated by it (Council Outlay 8, D16), or the trade direction or department
 * when that switches which of them is the tax date.
 */
export function changesTaxDate(before: TaxDateFields, changes: TaxDateFields): boolean {
  const after: TaxDateFields = { ...before };
  for (const key of TAX_FIELDS) if (key in changes) after[key] = changes[key] ?? null;
  const datesMoved = (["actualArrival", "actualDeparture"] as const).some((k) => (after[k] ?? null) !== (before[k] ?? null));
  return datesMoved || taxDateOf(after) !== taxDateOf(before) || deliveryBasisOf(after) !== deliveryBasisOf(before);
}
