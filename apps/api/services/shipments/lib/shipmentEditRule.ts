// Who may change a shipment's details (owner decision, 6 Nov 2026): at user level its Person in
// Charge and its Holiday Cover; a manager, an admin and a superadmin always. A shipment with
// neither named is open to anyone, who can then name one. Customs, the warehouse and invoicing
// work on shipments that aren't theirs, so their own fields stay open to every user. The same list
// is in the web's lib/shipmentEditRule, which makes the screens read-only to match.

import { isCreditApproved } from "./fieldDefaults";
import { receivedDateRefusal } from "../../../lib/warehouseReceivedRule";

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

/** Whether this Invoicing Status is Invoiced, however it is written. */
export const isInvoicedStatus = (value: string | null | undefined): boolean => (value ?? "").trim().toLowerCase() === "invoiced";

/**
 * Whether a shipment's copies of its parties' names and contacts follow a rename in the Customer
 * Database (owner decision, 17 Nov 2026): not once it is invoiced - a billed shipment keeps the
 * customer, agent and contacts it was billed with. One that is not invoiced follows as before.
 * The renames are bulk writes: partyLinks.repository spells this out in SQL (FOLLOWS_RENAMES).
 */
export const followsPartyRenames = (invoicingStatus: string | null | undefined): boolean => !isInvoicedStatus(invoicingStatus);

/**
 * Why the shipment may not be marked Invoiced, or null when it may (owner decision, 17 Nov 2026):
 * only once all its charges are - every selling line with a value, ticked for Invoice or not, on an
 * issued, not credited invoice. No role is let past it, a manager neither. The count is Invoicing's
 * (_internalChargeCount, by its chargesInvoiced rule in lib/shipmentStatus).
 */
export function invoicedRefusal(charges: { invoiced: number; total: number }): string | null {
  if (charges.total > 0 && charges.invoiced >= charges.total) return null;
  if (charges.total === 0) return "This shipment has no charges to invoice: it can be marked Invoiced once its selling lines are on an invoice";
  return `Not all charges are invoiced: ${charges.invoiced} of ${charges.total} selling lines are on an invoice. Invoice the rest first`;
}

export const DETAILS_REFUSAL = "Only the user in this shipment's Handled By or Holiday Cover, or a manager, can change its details";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
export const personEmail = (value: string | null | undefined) => (value ?? "").split(" — ")[0]!.trim().toLowerCase();

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

type WarehouseDates = { warehouseReceivedDate?: string | null; warehouseReleasedDate?: string | null };

/** The cargo is released from the warehouse only once it was received there. */
export const RELEASED_BEFORE_RECEIVED = "The cargo was not received in the warehouse yet: fill in Warehouse Received before Warehouse Released";

// The dates as they are, and as a write leaves them ("" for none).
const dateBefore = (existing: WarehouseDates, key: keyof WarehouseDates) => existing[key] ?? "";
const dateAfter = (existing: WarehouseDates, data: WarehouseDates, key: keyof WarehouseDates) => (key in data ? (data[key] ?? "") : dateBefore(existing, key));

/**
 * Why a person may not make this change to Warehouse Received, or null when they may: the
 * Warehouse Concept's rule for its own received date (lib/warehouseReceivedRule). At user level
 * never a day still to come (`today`, the Prague business day), not moved later or cleared once
 * set, and not changed once the cargo is released from the warehouse; a manager, an admin and a
 * superadmin may do all. The app's own writes (the Warehouse Concept's and Trucking's updates, a
 * master job's sync) carry stamps made under their own rules and aren't asked.
 */
export function warehouseReceivedRefusal(existing: WarehouseDates, data: WarehouseDates, role: string, today: string): string | null {
  const [before, after] = [dateBefore(existing, "warehouseReceivedDate"), dateAfter(existing, data, "warehouseReceivedDate")];
  if (after === before) return null;
  return receivedDateRefusal(before, after, !!dateBefore(existing, "warehouseReleasedDate"), role, today, "Warehouse Received");
}

/** Why a person may not set this Warehouse Released, or null when they may: only with Warehouse Received filled in, whoever asks. */
export function warehouseReleaseRefusal(existing: WarehouseDates, data: WarehouseDates): string | null {
  const released = dateAfter(existing, data, "warehouseReleasedDate");
  if (!released || released === dateBefore(existing, "warehouseReleasedDate")) return null;
  return dateAfter(existing, data, "warehouseReceivedDate") ? null : RELEASED_BEFORE_RECEIVED;
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
