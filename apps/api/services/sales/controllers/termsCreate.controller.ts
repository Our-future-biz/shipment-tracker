import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";
import { toTermsItem } from "../utils/termsItem.utils";
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
    const terms = await termsService.create(getAuthData()!, req.name);
    return { terms: toTermsItem(terms) };
  },
);
