import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";
import { toTermsItem } from "../utils/termsItem.utils";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsListResponse {
  data: TermsConditionItem[];
}

export const termsList = api(
  { expose: true, auth: true, method: "GET", path: "/terms-conditions" },
  async (): Promise<TermsListResponse> => {
    const data = await termsService.list(getAuthData()!.companyID);
    return { data: data.map(toTermsItem) };
  },
);
