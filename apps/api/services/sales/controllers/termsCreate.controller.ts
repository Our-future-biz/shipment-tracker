import { api, APIError } from "encore.dev/api";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsCreateRequest {
  name: string;
}

interface TermsCreateResponse {
  terms: TermsConditionItem;
}

export const termsCreate = api(
  { expose: true, auth: false, method: "POST", path: "/terms-conditions" },
  async (req: TermsCreateRequest): Promise<TermsCreateResponse> => {
    if (!req.name) {
      throw APIError.invalidArgument("name is required");
    }
    const terms = await termsService.create(req.name);
    return { terms: terms as unknown as TermsConditionItem };
  },
);
