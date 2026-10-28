import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerRole, RoleCompanyItem } from "../interfaces/interfaces";

interface CompaniesWithRoleRequest {
  role: CustomerRole;
  /** Only these customers (those of them that have the role), none for an empty list; every one with the role when left out. */
  ids?: string[] & MaxLen<2000>;
}

interface CompaniesWithRoleResponse {
  /** Live companies with the role, by company name. */
  companies: RoleCompanyItem[];
}

/**
 * Internal API of the services that keep suppliers' data (the tariffs service's rail operators, first / last mile
 * hauliers and shipping lines): the caller's company's companies with a role, a few fields each, so it can list them
 * and check that a company it is asked about really has the role. A POST, so an empty `ids` reaches the service as
 * sent (a query string cannot tell it from none).
 */
export const _internalCompaniesWithRole = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/with-role" },
  async ({ role, ids }: CompaniesWithRoleRequest): Promise<CompaniesWithRoleResponse> => {
    return { companies: await customerService.listWithRole(getAuthData()!.companyID, role, ids) };
  },
);
