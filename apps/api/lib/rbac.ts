import { APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";

// Roles are stored as a flat string on app_user:
//   superadmin — platform operator; manages companies and users across ALL companies.
//                Belongs to the internal "platform" company. Only a handful of these exist.
//   admin      — full control within their OWN company, including user management
//   manager    — day-to-day operations + limited user management (standard users only)
//   user       — operational access, no user management
export const ROLES = ["superadmin", "admin", "manager", "user"] as const;
export type Role = (typeof ROLES)[number];

// Company-level roles a company admin can assign; superadmin is never assignable via the API.
export const COMPANY_ROLES = ["admin", "manager", "user"] as const;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isCompanyRole(value: string): boolean {
  return (COMPANY_ROLES as readonly string[]).includes(value);
}

// admin and superadmin both have "admin-level" authority (may assign roles, act on
// elevated accounts). manager and user do not.
export function isAdminLevel(role: string): boolean {
  return role === "admin" || role === "superadmin";
}

export interface Actor {
  userID: string;
  companyID: string;
  role: string;
}

// Returns the authenticated actor, or throws 403 if their role isn't allowed.
// Always derives identity from the signed token — never from request input.
export function requireRole(...allowed: Role[]): Actor {
  const auth = getAuthData();
  if (!auth) {
    throw APIError.unauthenticated("Not authenticated");
  }
  if (allowed.length > 0 && !allowed.includes(auth.role as Role)) {
    throw APIError.permissionDenied("You do not have permission to perform this action");
  }
  return auth;
}
