import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { authService } from "../services/auth.service";
import type { UserRef } from "../interfaces/interfaces";

interface UserLookupRequest {
  ids: string[] & MaxLen<200>;
  /**
   * For a stamp of who did something: the caller themself is also found in their own company when a
   * superadmin works as another one (AuthData.homeCompanyID). Everybody else only in the caller's company.
   */
  selfInOwnCompany?: boolean;
}

interface UserLookupResponse {
  users: UserRef[];
}

// Internal only: names and current roles of the caller's company's users by id, so other
// services resolve the users on their records without loading the whole company.
export const userLookup = api(
  { expose: false, auth: true, method: "POST", path: "/auth/internal/users/lookup" },
  async ({ ids, selfInOwnCompany }: UserLookupRequest): Promise<UserLookupResponse> => {
    const caller = getAuthData()!;
    return { users: selfInOwnCompany ? await authService.userRefsWithSelf(caller, ids) : await authService.userRefs(caller.companyID, ids) };
  },
);
