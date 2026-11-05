import type { interfaces } from "@/lib/api/client";

// A company with no customer role is no sales prospect (Council Outlay 7, D1). Its stored status is
// kept as it is, but shown as whether we use the supplier: Inactive reads "Not in use", Active and
// Prospect (what every company is created with) read "In use".

export const SUPPLIER_IN_USE = "In use";
export const SUPPLIER_NOT_IN_USE = "Not in use";
export const SUPPLIER_STATUSES = [SUPPLIER_IN_USE, SUPPLIER_NOT_IN_USE] as const;

/** Whether the company is only a supplier: it has no customer role. */
export const isSupplierOnly = (roles: readonly interfaces.CustomerRole[]): boolean => !roles.includes("customer");

/**
 * Whether a supplier is offered where suppliers are picked (D16). Only a supplier only is "Not in use"
 * (stored Inactive): for a company that is a customer too, Inactive is its customer status, and as a
 * supplier it stays in use. The server's `inUse` follows the same rule.
 */
export const supplierInUse = (company: { status: interfaces.CustomerStatus; roles: readonly interfaces.CustomerRole[] }): boolean =>
  !(company.status === "Inactive" && isSupplierOnly(company.roles));

/** A new supplier added from a quote that waits for a manager (Sales → Managers → Company approval). */
export const WAITING_FOR_APPROVAL = "Waiting for approval";

/** The status as the company's page and the list show it. */
export function shownStatus(company: {
  status: interfaces.CustomerStatus;
  roles: readonly interfaces.CustomerRole[];
  approvalStatus?: interfaces.SupplierApprovalStatus;
}): string {
  if (company.approvalStatus === "pending") return WAITING_FOR_APPROVAL;
  if (!isSupplierOnly(company.roles)) return company.status;
  return supplierInUse(company) ? SUPPLIER_IN_USE : SUPPLIER_NOT_IN_USE;
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
