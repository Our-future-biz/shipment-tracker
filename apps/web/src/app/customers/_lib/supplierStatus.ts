import type { interfaces } from "@/lib/api/client";

// A company with no customer role is no sales prospect (Council Outlay 7, D1). Its stored status is
// kept as it is, but shown as whether we use the supplier: Inactive reads "Not in use", Active and
// Prospect (what every company is created with) read "In use".

export const SUPPLIER_IN_USE = "In use";
export const SUPPLIER_NOT_IN_USE = "Not in use";
export const SUPPLIER_STATUSES = [SUPPLIER_IN_USE, SUPPLIER_NOT_IN_USE] as const;

/** Whether the company is only a supplier: it has no customer role. */
export const isSupplierOnly = (roles: readonly interfaces.CustomerRole[]): boolean => !roles.includes("customer");

/** The status as the company's page and the list show it. */
export function shownStatus(company: { status: interfaces.CustomerStatus; roles: readonly interfaces.CustomerRole[] }): string {
  if (!isSupplierOnly(company.roles)) return company.status;
  return company.status === "Inactive" ? SUPPLIER_NOT_IN_USE : SUPPLIER_IN_USE;
}

/**
 * The status choices for a supplier only, each writing a stored status: In use is Active, Not in use
 * Inactive. A stored Prospect shows as In use and stays Prospect until someone changes it.
 */
export const SUPPLIER_STATUS_OPTIONS: { value: interfaces.CustomerStatus; label: string }[] = [
  { value: "Active", label: SUPPLIER_IN_USE },
  { value: "Inactive", label: SUPPLIER_NOT_IN_USE },
];

/** The value the supplier status select shows for a stored status. */
export const supplierStatusValue = (status: interfaces.CustomerStatus): interfaces.CustomerStatus =>
  status === "Inactive" ? "Inactive" : "Active";
