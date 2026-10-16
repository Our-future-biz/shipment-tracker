import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { haulierService } from "../services/haulier.service";
import type { HaulierListItem, HaulierStatus } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingHaulierListRequest {
  status?: HaulierStatus;
  /** Part of the company name, IČO or city */
  search?: string;
}

interface TruckingHaulierListResponse {
  hauliers: HaulierListItem[];
}

// Every company of the Customer Database with the role "haulier", with its trucking status and
// issues (a haulier without a profile is listed as blocked: no insurance and licence on file).
export const truckingHaulierList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/hauliers" },
  async ({ status, search }: TruckingHaulierListRequest): Promise<TruckingHaulierListResponse> => {
    await requireModule("trucking_concept");
    return { hauliers: await haulierService.list(getAuthData()!.companyID, { status, search }) };
  },
);
