import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsCreateRequest {
  name: string & MinLen<1> & MaxLen<200>;
}

interface TermsCreateResponse {
  terms: TermsConditionItem;
}

export const termsCreate = api(
  { expose: true, auth: true, method: "POST", path: "/terms-conditions" },
  async (req: TermsCreateRequest): Promise<TermsCreateResponse> => {
    return { terms: await termsService.create(getAuthData()!, req.name) };
  },
);
