import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { supplierApprovalService } from "../services/supplierApproval.service";
import type { SupplierApprovalItem } from "../interfaces/interfaces";

interface SupplierApprovalListResponse {
  /** What waits for a manager, and what was answered in the last 30 days; newest request first. */
  approvals: SupplierApprovalItem[];
}

// Sales → Managers → Company approval, and the bell: a manager is told what waits, the one who asked the answer.
export const supplierApprovalList = api(
  { expose: true, auth: true, method: "GET", path: "/customers/supplier-approvals" },
  async (): Promise<SupplierApprovalListResponse> => {
    return { approvals: await supplierApprovalService.list(getAuthData()!.companyID) };
  },
);

interface SupplierApprovalDecideRequest {
  id: string;
  decision: "approve" | "decline";
  /** Why it is declined (needed), or a note with an approval. */
  comment?: string & MaxLen<500>;
}

interface SupplierApprovalDecideResponse {
  approval: SupplierApprovalItem;
}

// Managers and admins only. Declined, the company is deleted (it can be restored from Deleted customers).
export const supplierApprovalDecide = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:id/supplier-approval" },
  async ({ id, decision, comment }: SupplierApprovalDecideRequest): Promise<SupplierApprovalDecideResponse> => {
    return { approval: await supplierApprovalService.decide(getAuthData()!, id, decision, comment) };
  },
);

interface SupplierApprovalSeenRequest {
  /** Companies whose answers the user has opened. */
  ids: string[] & MaxLen<200>;
}

export const supplierApprovalSeen = api(
  { expose: true, auth: true, method: "POST", path: "/customers/supplier-approvals/seen" },
  async ({ ids }: SupplierApprovalSeenRequest): Promise<void> => {
    await supplierApprovalService.seen(getAuthData()!, ids);
  },
);
