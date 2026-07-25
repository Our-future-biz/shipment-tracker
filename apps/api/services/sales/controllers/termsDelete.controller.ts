import { api } from "encore.dev/api";
import { termsService } from "../services/terms.service";

interface TermsDeleteRequest {
  id: string;
}

interface TermsDeleteResponse {
  ok: boolean;
}

export const termsDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/terms-conditions/:id" },
  async (req: TermsDeleteRequest): Promise<TermsDeleteResponse> => {
    await termsService.softDelete(req.id);
    return { ok: true };
  },
);
