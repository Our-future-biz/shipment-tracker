import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsCreateRequest {
  name: string;
}

interface TermsCreateResponse {
  terms: TermsConditionItem;
}

export const termsCreate = api(
  { expose: true, auth: true, method: "POST", path: "/terms-conditions" },
  async (req: TermsCreateRequest): Promise<TermsCreateResponse> => {
    if (!req.name) {
      throw APIError.invalidArgument("name is required");
    }
    const terms = await termsService.create(getAuthData()!.companyID, req.name);
    return { terms: terms as unknown as TermsConditionItem };
  },
);
