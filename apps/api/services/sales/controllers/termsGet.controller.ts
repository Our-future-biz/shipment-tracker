import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsGetRequest {
  id: string;
}

interface TermsGetResponse {
  terms: TermsConditionItem;
}

export const termsGet = api(
  { expose: true, auth: true, method: "GET", path: "/terms-conditions/:id" },
  async (req: TermsGetRequest): Promise<TermsGetResponse> => {
    return { terms: await termsService.get(req.id, getAuthData()!.companyID) };
  },
);
