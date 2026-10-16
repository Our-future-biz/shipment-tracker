import { APIError } from "encore.dev/api";

/** Roles that may change the trucking settings and block or unblock a haulier. */
export const MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;
export const isManager = (role: string | undefined | null) => (MANAGER_ROLES as readonly string[]).includes(role ?? "");

/**
 * Refuses a caller who is not a manager. Trucking services get the actor passed in (the controller's
 * auth, or the service identity on internal paths), so this checks that role rather than
 * lib/rbac requireRole, which reads the request's own auth.
 */
export const requireManager = (role: string | undefined | null, what: string) => {
  if (!isManager(role)) throw APIError.permissionDenied(`Only a manager can ${what}`);
};
