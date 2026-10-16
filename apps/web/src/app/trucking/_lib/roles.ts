// Who may change Trucking settings and block or unblock a haulier: the same roles the server allows.
export const TRUCKING_MANAGER_ROLES = ["superadmin", "admin", "manager"];

export const isTruckingManager = (user: { role: string } | null | undefined) => !!user && TRUCKING_MANAGER_ROLES.includes(user.role);

/**
 * One rule for a manager's control in Trucking: everyone sees it; for anyone else it is disabled
 * and says why. "" = the user may use it; otherwise the reason for the tooltip.
 */
export const managerOnlyReason = (user: { role: string } | null | undefined, what: string) => (isTruckingManager(user) ? "" : `Only a manager can ${what}`);
