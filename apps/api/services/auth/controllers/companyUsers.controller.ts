import { api, APIError } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

// Platform-only user management for ANY company. Company admins use /auth/users, which
// is scoped to their own company; these endpoints let a superadmin target a company by id.

interface CompanyUsersListRequest {
  companyId: string;
}
interface CompanyUsersListResponse {
  users: AuthUserInfo[];
}

export const companyUsersList = api(
  { expose: true, auth: true, method: "GET", path: "/companies/:companyId/users" },
  async (req: CompanyUsersListRequest): Promise<CompanyUsersListResponse> => {
    requireRole("superadmin");
    return { users: await authService.listUsers(req.companyId) };
  },
);

interface CompanyUserCreateRequest {
  companyId: string;
  email: string;
  password: string;
  displayName?: string;
  role?: string;
}
interface CompanyUserCreateResponse {
  user: AuthUserInfo;
}

export const companyUserCreate = api(
  { expose: true, auth: true, method: "POST", path: "/companies/:companyId/users" },
  async (req: CompanyUserCreateRequest): Promise<CompanyUserCreateResponse> => {
    const actor = requireRole("superadmin");
    const { companyId, ...input } = req;
    const user = await authService.createUser(companyId, actor, input);
    return { user };
  },
);

interface CompanyUserUpdateRequest {
  companyId: string;
  id: string;
  displayName?: string;
  role?: string;
  password?: string;
}
interface CompanyUserUpdateResponse {
  user: AuthUserInfo;
}

export const companyUserUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/companies/:companyId/users/:id" },
  async (req: CompanyUserUpdateRequest): Promise<CompanyUserUpdateResponse> => {
    const actor = requireRole("superadmin");
    const { companyId, id, ...patch } = req;
    const user = await authService.updateUser(id, companyId, actor, patch);
    if (!user) throw APIError.notFound("User not found");
    return { user };
  },
);

interface CompanyUserDeleteRequest {
  companyId: string;
  id: string;
}
interface CompanyUserDeleteResponse {
  ok: boolean;
}

export const companyUserDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/companies/:companyId/users/:id" },
  async (req: CompanyUserDeleteRequest): Promise<CompanyUserDeleteResponse> => {
    const actor = requireRole("superadmin");
    if (req.id === actor.userID) {
      throw APIError.invalidArgument("You cannot deactivate your own account");
    }
    const ok = await authService.deactivateUser(req.id, req.companyId, actor);
    if (!ok) throw APIError.notFound("User not found");
    return { ok: true };
  },
);
