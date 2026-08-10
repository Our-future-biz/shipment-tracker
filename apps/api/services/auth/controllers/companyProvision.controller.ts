import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

interface CompanyProvisionRequest {
  companyName: string;
  companySlug: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
}

interface CompanyProvisionResponse {
  companyId: string;
  admin: AuthUserInfo;
}

// Platform-only: create a new company and seat its first admin in one step.
export const companyProvision = api(
  { expose: true, auth: true, method: "POST", path: "/companies" },
  async (req: CompanyProvisionRequest): Promise<CompanyProvisionResponse> => {
    requireRole("superadmin");
    return authService.provisionCompany(req);
  },
);
