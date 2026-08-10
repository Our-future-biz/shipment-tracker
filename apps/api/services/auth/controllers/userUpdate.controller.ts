import { api, APIError } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

interface UserUpdateRequest {
  id: string;
  displayName?: string;
  role?: string;
  password?: string;
}

interface UserUpdateResponse {
  user: AuthUserInfo;
}

export const userUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/users/:id" },
  async (req: UserUpdateRequest): Promise<UserUpdateResponse> => {
    const actor = requireRole("admin", "manager");
    const { id, ...patch } = req;
    const user = await authService.updateUser(id, actor.companyID, actor, patch);
    if (!user) {
      throw APIError.notFound("User not found");
    }
    return { user };
  },
);
