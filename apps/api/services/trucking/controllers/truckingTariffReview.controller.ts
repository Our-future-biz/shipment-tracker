import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { tariffReviewService } from "../services/tariffReview.service";
import type { TariffVersionDiff, TestLaneLevel, TestLaneRequest } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingTariffVersionDiffRequest {
  id: string;
  /** Default: the tariff's version active today */
  againstVersionId?: string;
}

interface TruckingTariffVersionDiffResponse {
  diff: TariffVersionDiff;
}

// What a version changes against another version of the tariff (default the active one): price
// cells, zones, levels and surcharges.
export const truckingTariffVersionDiff = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/tariff-versions/:id/diff" },
  async ({ id, againstVersionId }: TruckingTariffVersionDiffRequest): Promise<TruckingTariffVersionDiffResponse> => {
    await requireModule("trucking_concept");
    return { diff: await tariffReviewService.diff(getAuthData()!.companyID, id, againstVersionId || undefined) };
  },
);

interface TruckingTariffVersionTestLaneRequest extends TestLaneRequest {
  id: string;
}

interface TruckingTariffVersionTestLaneResponse {
  levels: TestLaneLevel[];
}

// Prices a test shipment on this version (any status, drafts included) for each level it prices.
export const truckingTariffVersionTestLane = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/tariff-versions/:id/test-lane" },
  async ({ id, ...request }: TruckingTariffVersionTestLaneRequest): Promise<TruckingTariffVersionTestLaneResponse> => {
    await requireModule("trucking_concept");
    return { levels: await tariffReviewService.testLane(getAuthData()!.companyID, id, request) };
  },
);
