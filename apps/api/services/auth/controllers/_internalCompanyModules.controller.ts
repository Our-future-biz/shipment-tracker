import { api } from "encore.dev/api";
import { companyService } from "../services/company.service";
import type { AppModule } from "../interfaces/interfaces";

interface CompanyModulesRequest {
  companyId: string;
}

interface CompanyModulesResponse {
  hiddenModules: AppModule[];
}

// Internal only: the modules a company hides, for lib/modules (which caches it). No auth: the
// haulier portal and the public transport-order links ask it for a company with no user signed in.
export const _internalCompanyModules = api(
  { expose: false, auth: false, method: "GET", path: "/auth/internal/companies/:companyId/modules" },
  async ({ companyId }: CompanyModulesRequest): Promise<CompanyModulesResponse> => {
    return { hiddenModules: await companyService.hiddenModulesOf(companyId) };
  },
);
