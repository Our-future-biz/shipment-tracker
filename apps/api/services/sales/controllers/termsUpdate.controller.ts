import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsUpdateRequest {
  id: string;
  name?: string & MinLen<1> & MaxLen<200>;
  includes?: string & MaxLen<20000>;
  excludes?: string & MaxLen<20000>;
  /**
   * The updatedAt of the copy the change was made on, as the API handed it out. When the stored
   * template is no longer that version - somebody saved it since - nothing is written and the
   * call is refused with "aborted". Without it the change is written whatever is stored.
   */
  expectedUpdatedAt?: string;
}

interface TermsUpdateResponse {
  terms: TermsConditionItem;
}

/**
 * Changes one template: only the fields that are sent. A name is trimmed and refused when it is
 * empty or another template of the company has it; not found for a template that is deleted or
 * belongs to another company.
 */
export const termsUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/terms-conditions/:id" },
  async (req: TermsUpdateRequest): Promise<TermsUpdateResponse> => {
    const { id, ...change } = req;
    return { terms: await termsService.update(id, getAuthData()!, change) };
  },
);
