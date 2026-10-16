import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { tariffService } from "../services/tariff.service";
import type { TariffDetail } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

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
    await requireModule("trucking_concept");
    return { tariff: await tariffService.get(getAuthData()!.companyID, id) };
  },
);
