/** Roles that may change the trucking settings and block or unblock a haulier. */
export const MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;
export const isManager = (role: string | undefined | null) => (MANAGER_ROLES as readonly string[]).includes(role ?? "");
