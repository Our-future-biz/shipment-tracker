import { api } from "encore.dev/api";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsListResponse {
  data: TermsConditionItem[];
}

export const termsList = api(
  { expose: true, auth: false, method: "GET", path: "/terms-conditions" },
  async (): Promise<TermsListResponse> => {
    const data = await termsService.list();
    return { data: data as unknown as TermsConditionItem[] };
  },
);
