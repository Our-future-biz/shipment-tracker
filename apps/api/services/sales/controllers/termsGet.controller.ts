import { api, APIError } from "encore.dev/api";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsGetRequest {
  id: string;
}

interface TermsGetResponse {
  terms: TermsConditionItem;
}

export const termsGet = api(
  { expose: true, auth: false, method: "GET", path: "/terms-conditions/:id" },
  async (req: TermsGetRequest): Promise<TermsGetResponse> => {
    const terms = await termsService.getById(req.id);
    if (!terms) {
      throw APIError.notFound("Terms & conditions not found");
    }
    return { terms: terms as unknown as TermsConditionItem };
  },
);
