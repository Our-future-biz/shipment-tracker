import { api } from "encore.dev/api";
import { preferenceService } from "../services/preference.service";

interface PrefGetRequest {
  prefKey: string;
}

interface PrefGetResponse {
  value: unknown | null;
}

export const prefGet = api(
  { expose: true, auth: false, method: "GET", path: "/sales-prefs/:prefKey" },
  async (req: PrefGetRequest): Promise<PrefGetResponse> => {
    const value = await preferenceService.get(req.prefKey);
    return { value };
  },
);
