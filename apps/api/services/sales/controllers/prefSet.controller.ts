import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { preferenceService } from "../services/preference.service";

interface PrefSetRequest {
  prefKey: string;
  value: unknown;
}

interface PrefSetResponse {
  ok: boolean;
}

/**
 * Stores one of the preferences Sales keeps for the whole company - the columns and the saved
 * views of the Quotes list, the company details on quotations - in place of what was stored.
 * Refused for any other key, for a value that is missing, too large or not of the form the
 * preference has, and - the company details - for who may not edit the Sales settings.
 */
export const prefSet = api(
  { expose: true, auth: true, method: "PUT", path: "/sales-prefs/:prefKey" },
  async (req: PrefSetRequest): Promise<PrefSetResponse> => {
    await preferenceService.set(req.prefKey, getAuthData()!, req.value);
    return { ok: true };
  },
);
