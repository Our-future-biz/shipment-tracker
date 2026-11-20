import type { interfaces } from "@/lib/api/client";

// Pure helpers of Plan trip (PlanTripModal): which blocked hauliers are named under the agreed-price
// picker, and the warnings of the haulier picked. Tested in planTrip.test.ts.

type Haulier = Pick<interfaces.HaulierListItem, "customerId" | "companyName" | "status" | "issues">;

/** How many blocked hauliers are named under the picker; the rest are counted, with a link to the Hauliers tab. */
export const BLOCKED_SHOWN = 8;

/**
 * The blocked hauliers the agreed-price picker leaves out (T3), by name, from the list already
 * read (it carries status and issues). Those the buy tariffs priced are left out here: they are
 * listed apart above ("Not offered — blocked") with their reasons already.
 */
export function blockedLeftOut<H extends Haulier>(hauliers: readonly H[], listedApart: readonly { customerId: string }[]): H[] {
  const apart = new Set(listedApart.map((x) => x.customerId));
  return hauliers.filter((h) => h.status === "blocked" && !apart.has(h.customerId)).sort((a, b) => a.companyName.localeCompare(b.companyName, "cs"));
}

/**
 * The warnings of the haulier picked (an insurance expiring, no bank account from the VAT register
 * so its invoices will be blocked - T10, …): said before the trip is planned, never in its way.
 */
export function warningsOf(hauliers: readonly Haulier[], customerId: string | null | undefined): interfaces.HaulierIssue[] {
  if (!customerId) return [];
  return hauliers.find((h) => h.customerId === customerId)?.issues.filter((i) => i.severity === "warn") ?? [];
}
