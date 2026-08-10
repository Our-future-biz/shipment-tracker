import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

interface UserCreateRequest {
  email: string;
  password: string;
  displayName?: string;
  role?: string; // admin | manager | user
}

interface UserCreateResponse {
  user: AuthUserInfo;
}

// Admins and managers add users to their OWN company; companyId comes from the token.
export const userCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/users" },
  async (req: UserCreateRequest): Promise<UserCreateResponse> => {
    const actor = requireRole("admin", "manager");
    const user = await authService.createUser(actor.companyID, actor, req);
    return { user };
  },
);
