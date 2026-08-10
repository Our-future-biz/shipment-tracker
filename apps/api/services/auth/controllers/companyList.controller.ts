import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { companyService } from "../services/company.service";
import type { CompanyInfo } from "../services/company.service";

interface CompanyListResponse {
  companies: CompanyInfo[];
}

// Platform-only: lists every company. Company admins never see other companies.
export const companyList = api(
  { expose: true, auth: true, method: "GET", path: "/companies" },
  async (): Promise<CompanyListResponse> => {
    requireRole("superadmin");
    return { companies: await companyService.list() };
  },
);
