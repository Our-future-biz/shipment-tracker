import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { supplierApprovalService } from "../services/supplierApproval.service";
import type { SupplierApprovalState } from "../interfaces/interfaces";

interface SupplierApprovalStatesRequest {
  /** Suppliers the lines of a quote are linked to. */
  ids: string[] & MaxLen<500>;
}

interface SupplierApprovalStatesResponse {
  states: SupplierApprovalState[];
}

// Internal: the quotes service sends no quote linked to a new supplier that waits for a manager, or that a manager declined.
export const _internalSupplierApprovalStates = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/supplier-approval-states" },
  async ({ ids }: SupplierApprovalStatesRequest): Promise<SupplierApprovalStatesResponse> => {
    return { states: await supplierApprovalService.states(getAuthData()!.companyID, ids) };
  },
);
