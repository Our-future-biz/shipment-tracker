import { CUSTOMS_OFFICES } from "./customsOfficeList";

const isT1 = (procedure: string | null | undefined) => (procedure ?? "").trim().toUpperCase() === "T1";

const OFFICES: ReadonlySet<string> = new Set(CUSTOMS_OFFICES);

/** Whether this is an office of the list, as the list words it. */
export const isListedCustomsOffice = (office: string | null | undefined): boolean => OFFICES.has((office ?? "").trim());

/**
 * Why this office can't be stored, or null: an office is picked from the list, never typed freely.
 * The office a shipment already holds passes as it is, so one taken off the list since still saves.
 */
export function customsOfficeRefusal(office: string | null | undefined, stored?: string | null): string | null {
  const value = (office ?? "").trim();
  if (!value || value === (stored ?? "").trim()) return null;
  return isListedCustomsOffice(value) ? null : "Choose the Customs Office from the list";
}

/**
 * Only the T1 procedure names a customs office: under any other procedure the office is cleared,
 * also when the procedure changes on a screen that doesn't show the office (the grid), so a
 * shipment never keeps the office of a procedure it no longer has.
 */
export function customsOfficeForProcedure(procedure: string | null | undefined, office: string | null | undefined): { customsOffice?: string } {
  return !isT1(procedure) && office ? { customsOffice: "" } : {};
}

/** Who may change a chosen Customs Office directly, and answer the requests to change one. */
export const CUSTOMS_OFFICE_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

export const canChangeCustomsOffice = (role: string): boolean => (CUSTOMS_OFFICE_MANAGER_ROLES as readonly string[]).includes(role);

/**
 * Why this user may not make this edit, or null when they may. A chosen office is fixed for a
 * regular user: changing it takes a manager's approval (a request), and leaving T1 is refused too,
 * as that would clear the office without one. The first choice of an office is free.
 */
export function customsOfficeLockRefusal(
  existing: { customsProcedure: string; customsOffice: string },
  data: { customsProcedure?: string | null; customsOffice?: string | null },
  role: string,
): string | null {
  if (canChangeCustomsOffice(role) || !existing.customsOffice) return null;
  if ("customsOffice" in data && (data.customsOffice ?? "").trim() !== existing.customsOffice.trim()) {
    return "The Customs Office is already chosen: to change it, send a request for a manager's approval";
  }
  if ("customsProcedure" in data && !isT1(data.customsProcedure)) {
    return "This T1 shipment has its Customs Office chosen: only a manager can change the Customs Procedure";
  }
  return null;
}
