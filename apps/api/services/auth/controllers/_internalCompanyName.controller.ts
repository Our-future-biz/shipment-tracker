import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { companyService } from "../services/company.service";

interface CompanyNameResponse {
  name: string;
}

// Internal only: the caller's own company's registered name, for services that print it where no
// invoicing or quotation details are set (the haulier portal header).
export const _internalCompanyName = api(
  { expose: false, auth: true, method: "GET", path: "/auth/internal/company-name" },
  async (): Promise<CompanyNameResponse> => {
    return { name: await companyService.nameOf(getAuthData()!.companyID) };
  },
);
