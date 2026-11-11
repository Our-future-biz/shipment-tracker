// Who may change a shipment's details (owner decision, 6 Nov 2026): at user level its Person in
// Charge and its Holiday Cover; a manager, an admin and a superadmin always. A shipment with
// neither named is open to anyone, who can then name one. Customs, the warehouse and invoicing
// work on shipments that aren't theirs, so their own fields stay open to every user. The same list
// is in the web's lib/shipmentEditRule, which makes the screens read-only to match.

import { isCreditApproved } from "./fieldDefaults";

const MANAGER_ROLES = ["superadmin", "admin", "manager"];

/** The fields the other departments keep up, whoever the shipment's people are. */
export const DEPARTMENT_FIELDS: ReadonlySet<string> = new Set([
  // Customs
  "customsStatus",
  "customsPriority",
  "customsDeadline",
  "customsProcedure",
  "customsOffice",
  "mrn",
  "principalParty",
  "principalPartyId",
  "commercialInvoice",
  "commercialInvoices",
  "commercialInvoiceValue",
  "csRecvInvoice",
  "csRecvPacking",
  // Warehouse
  "etaWarehouse",
  "hub",
  "cfs",
  "warehouseReceivedDate",
  "warehouseReleasedDate",
  "warehouseReference",
  "warehouseTruck",
  "plateNumber",
  // Invoicing
  "invoicingStatus",
]);

/** An invoiced shipment keeps the offer it was invoiced from, until the invoice is credited. */
export const SALES_REFERENCE_INVOICED = "This shipment is invoiced: its Sales Reference can't be changed. Credit the invoice first";

export const DETAILS_REFUSAL = "Only the user in this shipment's Handled By or Holiday Cover, or a manager, can change its details";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const personEmail = (value: string | null | undefined) => (value ?? "").split(" — ")[0]!.trim().toLowerCase();

type People = { personInCharge?: string | null; holidayCover?: string | null };

/** Whether a role always may, so the user's e-mail needn't be looked up. */
export const isDetailsManager = (role: string): boolean => MANAGER_ROLES.includes(role);

/**
 * Why this user may not make this change to Approved By, or null when they may. Once the credit
 * check is approved, who approved it and when stands: only a manager, an admin or a superadmin may
 * delete or replace it, or change its date. The value sent back as it is passes, and an empty field
 * may still be filled.
 */
export function approvedByLockRefusal(
  existing: { creditCheck: string; approvedBy: string },
  data: { approvedBy?: string | null },
  role: string,
): string | null {
  if (isDetailsManager(role) || !("approvedBy" in data)) return null;
  if (!isCreditApproved(existing.creditCheck) || !existing.approvedBy.trim()) return null;
  if ((data.approvedBy ?? "").trim() === existing.approvedBy.trim()) return null;
  return "The credit check is approved: only a manager can change or delete Approved By";
}

/**
 * Why this user may not make this change to the credit check, or null when they may. Once it is
 * approved, only a manager, an admin or a superadmin may take it back. Otherwise a user could move
 * it off Green and so open Approved By to deleting (approvedByLockRefusal).
 */
export function creditCheckLockRefusal(existing: { creditCheck: string }, data: { creditCheck?: string | null }, role: string): string | null {
  if (isDetailsManager(role) || !("creditCheck" in data)) return null;
  if (!isCreditApproved(existing.creditCheck) || isCreditApproved(data.creditCheck)) return null;
  return "The credit check is approved: only a manager can change it";
}

/**
 * Why a person may not make this company the shipment's Customer, or null when they may: the Customer is a
 * company with the Customer role (K13), so a supplier is not made one by a pick. A shipment created from a
 * quote takes the quote's customer, which a manager may have approved as a supplier (Sales → Managers → Company approval).
 */
export function customerRoleRefusal(company: { companyName: string; roles: readonly string[] }): string | null {
  return company.roles.includes("customer") ? null : `Not a customer: ${company.companyName} has no Customer role in the Customer Database`;
}

/** Whether this user-level person may change the details: they are named, or nobody is. */
export function isOpenToPerson(shipment: People, email: string): boolean {
  const named = [shipment.personInCharge, shipment.holidayCover].map(personEmail).filter(Boolean);
  if (named.length === 0) return true;
  const mine = email.trim().toLowerCase();
  return !!mine && named.includes(mine);
}

/** Whether an edit touches anything beyond the departments' own fields. */
export const touchesDetails = (data: object): boolean =>
  Object.entries(data).some(([key, value]) => value !== undefined && !DEPARTMENT_FIELDS.has(key));
