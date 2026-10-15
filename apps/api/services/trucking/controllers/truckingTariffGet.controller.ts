import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { tariffService } from "../services/tariff.service";
import type { TariffDetail } from "../interfaces/interfaces";

interface TruckingTariffGetRequest {
  id: string;
}

interface TruckingTariffResponse {
  tariff: TariffDetail;
}

// One tariff with all its versions, newest first.
export const truckingTariffGet = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/tariffs/:id" },
  async ({ id }: TruckingTariffGetRequest): Promise<TruckingTariffResponse> => {
    return { tariff: await tariffService.get(getAuthData()!.companyID, id) };
  },
);
