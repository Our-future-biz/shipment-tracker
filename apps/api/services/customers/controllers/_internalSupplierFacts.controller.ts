import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { SupplierFacts } from "../interfaces/interfaces";
import { supplierFactsService } from "../services/supplierFacts.service";

interface SupplierFactsRequest {
  /** Suppliers of the invoices on the page. */
  ids: string[] & MaxLen<500>;
}

interface SupplierFactsResponse {
  suppliers: SupplierFacts[];
}

// Internal: the invoicing service marks the suppliers' invoices on Finance → Accounts Payable by these (services/supplierFacts.service).
export const _internalSupplierFacts = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/supplier-facts" },
  async ({ ids }: SupplierFactsRequest): Promise<SupplierFactsResponse> => {
    return { suppliers: await supplierFactsService.factsOf(getAuthData()!.companyID, ids) };
  },
);
