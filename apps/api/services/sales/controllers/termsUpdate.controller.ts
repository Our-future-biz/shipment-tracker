import { api, APIError } from "encore.dev/api";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsUpdateRequest {
  id: string;
  name?: string;
  includes?: string;
  excludes?: string;
}

interface TermsUpdateResponse {
  terms: TermsConditionItem;
}

export const termsUpdate = api(
  { expose: true, auth: false, method: "PATCH", path: "/terms-conditions/:id" },
  async (req: TermsUpdateRequest): Promise<TermsUpdateResponse> => {
    const { id, ...patch } = req;
    const terms = await termsService.update(id, patch);
    if (!terms) {
      throw APIError.notFound("Terms & conditions not found");
    }
    return { terms: terms as unknown as TermsConditionItem };
  },
);
