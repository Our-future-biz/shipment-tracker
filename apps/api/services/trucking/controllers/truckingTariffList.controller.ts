import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { tariffService } from "../services/tariff.service";
import type { TariffListItem, TariffSide } from "../interfaces/interfaces";

interface TruckingTariffListRequest {
  side?: TariffSide;
  ownerCustomerId?: string;
}

interface TruckingTariffListResponse {
  tariffs: TariffListItem[];
}

// Every tariff of the company (buy, sell, internal) with its active and next version.
export const truckingTariffList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/tariffs" },
  async ({ side, ownerCustomerId }: TruckingTariffListRequest): Promise<TruckingTariffListResponse> => {
    return { tariffs: await tariffService.list(getAuthData()!.companyID, { side, ownerCustomerId }) };
  },
);
