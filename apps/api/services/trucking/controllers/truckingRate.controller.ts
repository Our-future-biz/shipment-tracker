import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { rateService } from "../services/rate.service";
import type { RateRequest, RateResponse } from "../interfaces/interfaces";

// The rate calculator (any user; buy prices are visible to all users): sell, buy and internal
// prices of a shipment for each service level, with the margin and the promised delivery date.
export const truckingRate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/rate" },
  async (req: RateRequest): Promise<RateResponse> => {
    return rateService.rate(getAuthData()!.companyID, req);
  },
);
