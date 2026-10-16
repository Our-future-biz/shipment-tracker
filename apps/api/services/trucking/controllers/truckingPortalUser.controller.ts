import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { portalUserService } from "../services/portalUser.service";
import type { PortalUserItem } from "../interfaces/portal.interfaces";
import { requireModule } from "../../../lib/modules";

// A haulier's haulier-portal users (any user sees them; a manager adds, resets, disables, enables).
// E-mail is off: an invitation or reset answers with a one-time link, shown once.

interface TruckingPortalUserListRequest {
  customerId: string;
}

interface TruckingPortalUserListResponse {
  users: PortalUserItem[];
}

export const truckingPortalUserList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/hauliers/:customerId/portal-users" },
  async ({ customerId }: TruckingPortalUserListRequest): Promise<TruckingPortalUserListResponse> => {
    await requireModule("trucking_concept");
    return { users: await portalUserService.list(requireRole(), customerId) };
  },
);

interface TruckingPortalUserCreateRequest {
  customerId: string;
  email: string;
  name: string;
  phone: string;
}

interface TruckingPortalUserCreateResponse {
  user: PortalUserItem;
  /** One-time link to set the password: shown once */
  inviteLink: string;
  expiresAt: string;
}

// Adds a portal user (manager) and gives the invitation link.
export const truckingPortalUserCreate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/hauliers/:customerId/portal-users", sensitive: true },
  async ({ customerId, email, name, phone }: TruckingPortalUserCreateRequest): Promise<TruckingPortalUserCreateResponse> => {
    await requireModule("trucking_concept");
    return portalUserService.create(requireRole("superadmin", "admin", "manager"), customerId, { email, name, phone });
  },
);

interface TruckingPortalUserIdRequest {
  id: string;
}

interface TruckingPortalUserResetResponse {
  /** One-time link to set a new password: shown once */
  resetLink: string;
  expiresAt: string;
}

// Resets the password (manager): the old one stops working, the user's sessions end, a one-time link comes back.
export const truckingPortalUserReset = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/portal-users/:id/reset", sensitive: true },
  async ({ id }: TruckingPortalUserIdRequest): Promise<TruckingPortalUserResetResponse> => {
    await requireModule("trucking_concept");
    return portalUserService.reset(requireRole("superadmin", "admin", "manager"), id);
  },
);

interface TruckingPortalUserDisableRequest {
  id: string;
  /** Why (3 to 500 characters) */
  reason: string;
}

interface TruckingPortalUserResponse {
  user: PortalUserItem;
}

// Disables a portal user (manager): their sessions and open links end.
export const truckingPortalUserDisable = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/portal-users/:id/disable" },
  async ({ id, reason }: TruckingPortalUserDisableRequest): Promise<TruckingPortalUserResponse> => {
    await requireModule("trucking_concept");
    return { user: await portalUserService.disable(requireRole("superadmin", "admin", "manager"), id, reason) };
  },
);

// Enables a disabled portal user (manager).
export const truckingPortalUserEnable = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/portal-users/:id/enable" },
  async ({ id }: TruckingPortalUserIdRequest): Promise<TruckingPortalUserResponse> => {
    await requireModule("trucking_concept");
    return { user: await portalUserService.enable(requireRole("superadmin", "admin", "manager"), id) };
  },
);
