import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { userPreferenceRepository } from "../repositories/userPreference.repository";

/**
 * Nastaveni rozhrani ulozene pro prihlaseneho uzivatele.
 * Pouziva se pro vyber poli zobrazenych v kartach na zalozce Details.
 */

interface UserPrefGetRequest {
  prefKey: string;
}

interface UserPrefGetResponse {
  /** JSON s nastavenim; null kdyz uzivatel jeste nic neulozil */
  value: string | null;
}

export const userPrefGet = api(
  { expose: true, auth: true, method: "GET", path: "/user-prefs/:prefKey" },
  async (req: UserPrefGetRequest): Promise<UserPrefGetResponse> => {
    const auth = getAuthData()!;
    const row = await userPreferenceRepository.get(auth.companyID, auth.userID, req.prefKey);
    // hodnota chodi jako JSON retezec - Encore neumi predat volny objekt
    return { value: row ? JSON.stringify(row.value) : null };
  },
);

interface UserPrefSetRequest {
  prefKey: string;
  /** JSON s nastavenim */
  value: string;
}

interface UserPrefSetResponse {
  ok: boolean;
}

export const userPrefSet = api(
  { expose: true, auth: true, method: "PUT", path: "/user-prefs/:prefKey" },
  async (req: UserPrefSetRequest): Promise<UserPrefSetResponse> => {
    const auth = getAuthData()!;
    // Reject malformed JSON instead of storing {} — a silent reset would wipe
    // the preference the caller was trying to save.
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.value || "{}");
    } catch {
      throw APIError.invalidArgument("value must be valid JSON");
    }
    await userPreferenceRepository.set(auth.companyID, auth.userID, req.prefKey, parsed);
    return { ok: true };
  },
);
