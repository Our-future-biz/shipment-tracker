import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { userPreferenceService } from "../services/userPreference.service";

// UI settings saved for the signed-in user, e.g. the fields the Details cards show.

interface UserPrefGetRequest {
  prefKey: string;
}

interface UserPrefGetResponse {
  /** The settings as JSON; null while the user has saved nothing. */
  value: string | null;
}

export const userPrefGet = api(
  { expose: true, auth: true, method: "GET", path: "/user-prefs/:prefKey" },
  async (req: UserPrefGetRequest): Promise<UserPrefGetResponse> => {
    const auth = getAuthData()!;
    return { value: await userPreferenceService.get(auth.companyID, auth.userID, req.prefKey) };
  },
);

interface UserPrefSetRequest {
  prefKey: string & MinLen<1> & MaxLen<100>;
  /** The settings as JSON. */
  value: string & MaxLen<100000>;
}

interface UserPrefSetResponse {
  ok: boolean;
}

export const userPrefSet = api(
  { expose: true, auth: true, method: "PUT", path: "/user-prefs/:prefKey" },
  async (req: UserPrefSetRequest): Promise<UserPrefSetResponse> => {
    const auth = getAuthData()!;
    await userPreferenceService.set(auth.companyID, auth.userID, req.prefKey, req.value);
    return { ok: true };
  },
);
