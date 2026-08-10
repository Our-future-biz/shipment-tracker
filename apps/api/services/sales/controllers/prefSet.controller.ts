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

export const prefSet = api(
  { expose: true, auth: true, method: "PUT", path: "/sales-prefs/:prefKey" },
  async (req: PrefSetRequest): Promise<PrefSetResponse> => {
    await preferenceService.set(req.prefKey, getAuthData()!.companyID, req.value ?? {});
    return { ok: true };
  },
);
