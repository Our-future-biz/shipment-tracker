import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { userPreferenceRepository } from "../repositories/userPreference.repository";

/**
 * Nastaveni rozhrani ulozene pro prihlaseneho uzivatele.
 * Pouziva se pro vyber poli zobrazenych v kartach na zalozce Details.
 */

interface PrefGetRequest {
  prefKey: string;
}

interface PrefGetResponse {
  /** JSON s nastavenim; null kdyz uzivatel jeste nic neulozil */
  value: string | null;
}

export const userPrefGet = api(
  { expose: true, auth: true, method: "GET", path: "/user-prefs/:prefKey" },
  async (req: PrefGetRequest): Promise<PrefGetResponse> => {
    const auth = getAuthData()!;
    const row = await userPreferenceRepository.get(auth.companyID, auth.userID, req.prefKey);
    // hodnota chodi jako JSON retezec - Encore neumi predat volny objekt
    return { value: row ? JSON.stringify(row.value) : null };
  },
);

interface PrefSetRequest {
  prefKey: string;
  /** JSON s nastavenim */
  value: string;
}

interface PrefSetResponse {
  ok: boolean;
}

export const userPrefSet = api(
  { expose: true, auth: true, method: "PUT", path: "/user-prefs/:prefKey" },
  async (req: PrefSetRequest): Promise<PrefSetResponse> => {
    const auth = getAuthData()!;
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(req.value || "{}");
    } catch {
      parsed = {};
    }
    await userPreferenceRepository.set(auth.companyID, auth.userID, req.prefKey, parsed);
    return { ok: true };
  },
);
