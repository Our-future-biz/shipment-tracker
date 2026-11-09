import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { tariffRepository } from "../repositories/tariff.repository";

interface VersionsValidRequest {
  ids: string[];
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Internal API for Sales' overnight tariff check: which of these trucking tariff versions are
 * binding on the day, so a road quote that can't be rated is only cleared when its tariff has really lapsed.
 */
export const _internalTruckingVersionsValid = api(
  { expose: false, auth: true, method: "POST", path: "/internal/trucking/versions-valid" },
  async ({ ids, date }: VersionsValidRequest): Promise<{ valid: string[] }> => {
    const companyId = getAuthData()!.companyID;
    const versions = await Promise.all([...new Set(ids)].map((id) => tariffRepository.findVersion(companyId, id)));
    const valid = versions.filter((v) => !!v && !!v.activatedAt && !v.supersededAt && v.validFrom <= date && (!v.validTo || v.validTo >= date));
    return { valid: valid.map((v) => v!.id) };
  },
);
