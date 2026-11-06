// Who may change a shipment's details (owner decision, 6 Nov 2026): at user level its Person in
// Charge and its Holiday Cover; a manager, an admin and a superadmin always. A shipment with
// neither named is open to anyone, who can then name one. Customs, the warehouse and invoicing
// work on shipments that aren't theirs, so their own fields stay open to every user. The same list
// is in the web's lib/shipmentEditRule, which makes the screens read-only to match.

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

export const DETAILS_REFUSAL = "Only this shipment's Person in Charge, Holiday Cover or a manager can change its details";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const personEmail = (value: string | null | undefined) => (value ?? "").split(" — ")[0]!.trim().toLowerCase();

type People = { personInCharge?: string | null; holidayCover?: string | null };

/** Whether a role always may, so the user's e-mail needn't be looked up. */
export const isDetailsManager = (role: string): boolean => MANAGER_ROLES.includes(role);

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
