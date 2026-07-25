import { api } from "encore.dev/api";
import { preferenceService } from "../services/preference.service";

interface PrefSetRequest {
  prefKey: string;
  value: unknown;
}

interface PrefSetResponse {
  ok: boolean;
}

export const prefSet = api(
  { expose: true, auth: false, method: "PUT", path: "/sales-prefs/:prefKey" },
  async (req: PrefSetRequest): Promise<PrefSetResponse> => {
    await preferenceService.set(req.prefKey, req.value ?? {});
    return { ok: true };
  },
);
