import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { forgetHiddenModules } from "../../../lib/modules";
import { companyService } from "../services/company.service";
import type { CompanyInfo } from "../services/company.service";
import type { AppModule } from "../interfaces/interfaces";

interface CompanyModulesUpdateRequest {
  id: string;
  /** The modules the company's users do not get; [] shows everything */
  hiddenModules: AppModule[];
}

interface CompanyModulesUpdateResponse {
  company: CompanyInfo;
}

// Platform-only: which modules a company's users get. Superadmins always see every module. Other
// services cache a company's hidden modules for up to a minute (lib/modules), so a change can take
// that long to reach them.
export const companyModulesUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/companies/:id/modules" },
  async ({ id, hiddenModules }: CompanyModulesUpdateRequest): Promise<CompanyModulesUpdateResponse> => {
    requireRole("superadmin");
    const company = await companyService.setHiddenModules(id, hiddenModules);
    forgetHiddenModules(id);
    return { company };
  },
);
