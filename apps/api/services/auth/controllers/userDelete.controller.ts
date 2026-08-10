import { api, APIError } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { authService } from "../services/auth.service";

interface UserDeleteRequest {
  id: string;
}

interface UserDeleteResponse {
  ok: boolean;
}

// Deactivates (soft-deletes) a user within the caller's company. You can't deactivate
// yourself, so a company can't accidentally lock out its last admin from this call.
export const userDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/users/:id" },
  async (req: UserDeleteRequest): Promise<UserDeleteResponse> => {
    const actor = requireRole("admin", "manager");
    if (req.id === actor.userID) {
      throw APIError.invalidArgument("You cannot deactivate your own account");
    }
    const ok = await authService.deactivateUser(req.id, actor.companyID, actor);
    if (!ok) {
      throw APIError.notFound("User not found");
    }
    return { ok: true };
  },
);
