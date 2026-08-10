import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { termsService } from "../services/terms.service";

interface TermsDeleteRequest {
  id: string;
}

interface TermsDeleteResponse {
  ok: boolean;
}

export const termsDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/terms-conditions/:id" },
  async (req: TermsDeleteRequest): Promise<TermsDeleteResponse> => {
    await termsService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
