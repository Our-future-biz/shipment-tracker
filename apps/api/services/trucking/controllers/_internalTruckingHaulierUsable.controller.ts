import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { haulierService } from "../services/haulier.service";
import type { HaulierIssue } from "../interfaces/interfaces";

interface HaulierUsableRequest {
  customerId: string;
}

interface HaulierUsableResponse {
  /** False when any block issue stands (blocked, insurance or licence missing / expired, unreliable VAT payer). */
  usable: boolean;
  issues: HaulierIssue[];
}

/** Internal API for the later trucking phases: whether a haulier may be put on a trip today. */
export const _internalTruckingHaulierUsable = api(
  { expose: false, auth: true, method: "GET", path: "/internal/trucking/hauliers/:customerId/usable" },
  async ({ customerId }: HaulierUsableRequest): Promise<HaulierUsableResponse> => {
    return haulierService.usable(getAuthData()!.companyID, customerId);
  },
);
