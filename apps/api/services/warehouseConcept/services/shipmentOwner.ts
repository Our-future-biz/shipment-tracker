import type { CompanyUser } from "../../../lib/personPick";
import { normalizedPerson, pickedUserFromRequest } from "./pickedUser";

// The Shipment Owner of a gate record is a user of the company, stored by their e-mail (owner
// decision 26 Oct 2026). A user typing it picks a user; the copy from a shipment (import,
// "Refresh from shipment") takes the shipment's person in charge as it is.

export const SHIPMENT_OWNER_LABEL = "Shipment Owner";

/** What walk-ins used to get as their owner before it was left empty; read as "nobody". */
export const OLD_WALK_IN_OWNER = "— notify ops";

/**
 * The Shipment Owner to store from a user's request: "" or a user's e-mail. The record's current
 * value is accepted unchanged (an old name stays until somebody picks a user).
 */
export function ownerFromRequest(value: string, current: string | null, loadUsers: () => Promise<CompanyUser[]>): Promise<string> {
  return pickedUserFromRequest(value, current, SHIPMENT_OWNER_LABEL, loadUsers);
}

/**
 * What a stored Shipment Owner becomes in the backfill: "" for the old walk-in placeholder, the
 * e-mail of the one user an old value names, or null when it stays as it is (already a user's
 * e-mail, or no single user fits).
 */
export function normalizedOwner(value: string, users: CompanyUser[]): string | null {
  if (value === OLD_WALK_IN_OWNER) return "";
  return normalizedPerson(value, users);
}
