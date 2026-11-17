import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { claimService } from "../services/claim.service";
import type { CostClaimFact } from "../interfaces/interfaces";

interface CostClaimsRequest {
  shipmentIds?: string[] & MaxLen<2000>;
  supplierInvoiceIds?: string[] & MaxLen<2000>;
}

interface CostClaimsResponse {
  /** Live claims on costs on any of the shipments or against any of the supplier invoices; none when neither is given. */
  claims: CostClaimFact[];
}

/**
 * Internal API of the invoicing service (Accounts Payable): the claims on costs of the caller's
 * company on the given shipments or supplier invoices. An open one holds the invoice's payment;
 * invoicing enforces that, this only tells it the claims.
 */
export const _internalCostClaims = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/cost-claims" },
  async ({ shipmentIds, supplierInvoiceIds }: CostClaimsRequest): Promise<CostClaimsResponse> => ({
    claims: await claimService.costClaims(getAuthData()!.companyID, shipmentIds ?? [], supplierInvoiceIds ?? []),
  }),
);
