// Who may change Trucking settings and block or unblock a haulier: the same roles the server allows.
export const TRUCKING_MANAGER_ROLES = ["superadmin", "admin", "manager"];

export const isTruckingManager = (user: { role: string } | null | undefined) => !!user && TRUCKING_MANAGER_ROLES.includes(user.role);
