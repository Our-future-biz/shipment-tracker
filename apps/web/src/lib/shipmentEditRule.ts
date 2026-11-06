// Who may change a shipment's details (owner decision, 6 Nov 2026): at user level its Person in
// Charge and its Holiday Cover; a manager, an admin and a superadmin always. A shipment with
// neither named is open to anyone, who can then name one. Customs, the warehouse and invoicing keep
// their own fields open to every user. The server enforces the same (its lib/shipmentEditRule); this
// only makes the screens read-only to match.

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

/** Whether this user may change this field: a department's own, or any when the details are theirs. */
export const canChangeShipmentField = (user: Viewer, shipment: People, field: string): boolean =>
  DEPARTMENT_FIELDS.has(field) || canChangeShipmentDetails(user, shipment);
