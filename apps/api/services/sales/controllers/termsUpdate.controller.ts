import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsUpdateRequest {
  id: string;
  name?: string & MinLen<1> & MaxLen<200>;
  includes?: string & MaxLen<20000>;
  excludes?: string & MaxLen<20000>;
}

interface TermsUpdateResponse {
  terms: TermsConditionItem;
}

// Terms templates are company-wide settings: managers and up.
export const termsUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/terms-conditions/:id" },
  async ({ id, ...patch }: TermsUpdateRequest): Promise<TermsUpdateResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { terms: await termsService.update(id, actor.companyID, patch) };
  },
);
