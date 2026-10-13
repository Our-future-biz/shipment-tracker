import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";
import { toTermsItem } from "../utils/termsItem.utils";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsUpdateRequest {
  id: string;
  name?: string;
  includes?: string;
  excludes?: string;
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
    const terms = await termsService.update(id, getAuthData()!, change);
    if (!terms) {
      throw APIError.notFound("Terms & conditions not found");
    }
    return { terms: toTermsItem(terms) };
  },
);
