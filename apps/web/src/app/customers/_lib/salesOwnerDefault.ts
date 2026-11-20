// Who Add customer's Sales owner field starts with (mock council R12). The server's creatorAsOwner
// (customers service) follows the same rule for a customer added without the field, so what the
// field shows untouched is what the customer gets.

/**
 * Whether a department (its name in Settings → Users) is a Sales one: "Sales", "Sales CZ", "Air
 * Sales". The app has no Sales role - the roles are user, manager and admin - so a user counts as
 * Sales by the department they sit in. The server tells it the same way (isSalesDepartment).
 */
export const isSalesDepartment = (name: string | null | undefined): boolean => /\bsales\b/i.test((name ?? "").trim());

// The roles that own a customer they add, whatever their department.
const OWNING_ROLES = ["manager", "admin", "superadmin"];

interface Adder {
  id: string;
  role: string;
  departmentId: string | null;
}

/**
 * The sales owner a new customer starts with: the user adding it when they are in Sales or a
 * manager, else nobody - an operator or a billing clerk who adds a consignee for a job is nobody's
 * sales owner. Nobody too when the adder is not among the company's users (a superadmin working as
 * another company), as the server can't make them the owner either.
 */
export function defaultSalesOwner(
  adder: Adder | null,
  companyUsers: readonly { id: string }[],
  departments: readonly { id: string; name: string }[],
): string | null {
  if (!adder || !companyUsers.some((u) => u.id === adder.id)) return null;
  if (OWNING_ROLES.includes(adder.role)) return adder.id;
  const department = departments.find((d) => d.id === adder.departmentId);
  return isSalesDepartment(department?.name) ? adder.id : null;
}

/**
 * Whom Add customer's Sales owner offers (system-21 mock council review): who owns a customer is a manager's
 * field, so a manager picks any of the company's users, anyone else only themself - or nobody, by clearing it.
 * The server refuses any other pick (customers service ownerOfNew).
 */
export function salesOwnerChoices<U extends { id: string }>(adderId: string | null | undefined, isManager: boolean, companyUsers: readonly U[]): U[] {
  return isManager ? [...companyUsers] : companyUsers.filter((u) => !!adderId && u.id === adderId);
}
