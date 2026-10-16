import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { haulierService } from "../services/haulier.service";
import type { TruckingHaulierResponse } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingHaulierBlockRequest {
  customerId: string;
  /** Why (3 to 500 characters) */
  reason: string;
}

// Blocks a haulier (manager): it cannot be put on a trip until unblocked.
export const truckingHaulierBlock = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/hauliers/:customerId/block" },
  async ({ customerId, reason }: TruckingHaulierBlockRequest): Promise<TruckingHaulierResponse> => {
    await requireModule("trucking_concept");
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { haulier: await haulierService.block(companyID, userID, role, customerId, reason) };
  },
);

// Lifts the block (manager), with the reason.
export const truckingHaulierUnblock = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/hauliers/:customerId/unblock" },
  async ({ customerId, reason }: TruckingHaulierBlockRequest): Promise<TruckingHaulierResponse> => {
    await requireModule("trucking_concept");
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { haulier: await haulierService.unblock(companyID, userID, role, customerId, reason) };
  },
);
