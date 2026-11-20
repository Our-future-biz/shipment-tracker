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

type VehicleType = Pick<interfaces.VehicleTypeSetting, "code" | "label">;

/** A vehicle type to pick, or a heading over some (antd Select's option groups). */
export interface VehicleOption {
  label: string;
  value?: string;
  options?: { value: string; label: string }[];
}

/**
 * The vehicle types offered for the haulier picked: its own first (the types on its Trucking
 * profile), the others after, under their own heading (user council T16: all five were offered to a
 * haulier with two). A haulier that lists none, or none picked yet, gets them all as one list.
 */
export function vehicleOptions(vehicles: readonly VehicleType[], haulierTypes: readonly string[] | undefined): VehicleOption[] {
  const option = (v: VehicleType) => ({ value: v.code, label: v.label });
  if (!haulierTypes?.length) return vehicles.map(option);
  const own = vehicles.filter((v) => haulierTypes.includes(v.code));
  const other = vehicles.filter((v) => !haulierTypes.includes(v.code));
  if (!own.length) return vehicles.map(option);
  return [
    { label: "This haulier's vehicles", options: own.map(option) },
    ...(other.length ? [{ label: "Other types", options: other.map(option) }] : []),
  ];
}

/** The warning when the vehicle type picked is not one the haulier lists; "" when it is, or nothing is known. */
export function vehicleWarning(vehicles: readonly VehicleType[], haulierTypes: readonly string[] | undefined, code: string | null): string {
  if (!code || !haulierTypes?.length || haulierTypes.includes(code)) return "";
  const label = vehicles.find((v) => v.code === code)?.label ?? code;
  return `${label} is not among the haulier's vehicles on its Trucking profile — check it can send one.`;
}

/**
 * The warnings of the haulier picked (an insurance expiring, no bank account from the VAT register
 * so its invoices will be blocked - T10, …): said before the trip is planned, never in its way.
 */
export function warningsOf(hauliers: readonly Haulier[], customerId: string | null | undefined): interfaces.HaulierIssue[] {
  if (!customerId) return [];
  return hauliers.find((h) => h.customerId === customerId)?.issues.filter((i) => i.severity === "warn") ?? [];
}
