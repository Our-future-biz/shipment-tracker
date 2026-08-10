import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

interface UsersListResponse {
  users: AuthUserInfo[];
}

export const usersList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/users" },
  async (): Promise<UsersListResponse> => {
    const companyId = getAuthData()!.companyID;
    return { users: await authService.listUsers(companyId) };
  },
);
