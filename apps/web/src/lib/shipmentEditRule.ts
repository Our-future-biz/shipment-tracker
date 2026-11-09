// Who may change a shipment's details (owner decision, 6 Nov 2026): at user level its Person in
// Charge and its Holiday Cover; a manager, an admin and a superadmin always. A shipment with
// neither named is open to anyone, who can then name one. Customs, the warehouse and invoicing keep
// their own fields open to every user. The server enforces the same (its lib/shipmentEditRule); this
// only makes the screens read-only to match.

const MANAGER_ROLES = ["superadmin", "admin", "manager"];

/** An invoiced shipment keeps the offer it was invoiced from, until the invoice is credited. */
export const salesReferenceLocked = (invoicingStatus: string | null | undefined): boolean => invoicingStatus === "Invoiced";
export const SALES_REFERENCE_LOCKED_HINT = "This shipment is invoiced: its Sales Reference can't be changed";

/** Whether a role is a manager's, who may do what a regular user may not. */
export const isDetailsManager = (role: string): boolean => MANAGER_ROLES.includes(role);

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

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const personEmail = (value: string | null | undefined) => (value ?? "").split(" — ")[0]!.trim().toLowerCase();

type Viewer = { role: string; email: string } | null | undefined;
type People = { personInCharge?: string | null; holidayCover?: string | null };

/** Whether this user may change the shipment's details. */
export function canChangeShipmentDetails(user: Viewer, shipment: People): boolean {
  if (!user) return false;
  if (MANAGER_ROLES.includes(user.role)) return true;
  const named = [shipment.personInCharge, shipment.holidayCover].map(personEmail).filter(Boolean);
  return named.length === 0 || named.includes(user.email.trim().toLowerCase());
}

/**
 * Whether Approved By is closed to this user: the credit check is approved and someone is named,
 * so only a manager, an admin or a superadmin may delete or replace it. The server refuses the same.
 */
export function isApprovedByLocked(user: Viewer, shipment: { creditCheck?: string | null; approvedBy?: string | null }): boolean {
  return isCreditCheckLocked(user, shipment) && !!(shipment.approvedBy ?? "").trim();
}

/** Whether the credit check is closed to this user: once approved, only a manager, an admin or a superadmin may take it back. The server refuses the same. */
export function isCreditCheckLocked(user: Viewer, shipment: { creditCheck?: string | null }): boolean {
  if (MANAGER_ROLES.includes(user?.role ?? "")) return false;
  return (shipment.creditCheck ?? "").trim().toLowerCase() === "green";
}

/** Whether this user may change this field: a department's own, or any when the details are theirs. */
export const canChangeShipmentField = (user: Viewer, shipment: People, field: string): boolean =>
  DEPARTMENT_FIELDS.has(field) || canChangeShipmentDetails(user, shipment);
