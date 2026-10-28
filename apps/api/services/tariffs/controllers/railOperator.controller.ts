import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { railTariffService, type RailOperatorDetail } from "../services/railTariff.service";
import type { RailOperatorItem } from "../interfaces/interfaces";

interface RailOperatorListResponse {
  /** Customer Database companies with the Rail operator role, by name */
  operators: RailOperatorItem[];
}

// The rail operators with their tariffs at a glance.
export const railOperatorList = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/rail/operators" },
  async (): Promise<RailOperatorListResponse> => {
    return { operators: await railTariffService.operators(getAuthData()!.companyID) };
  },
);

interface RailOperatorGetRequest {
  /** The operator's Customer Database id */
  customerId: string;
}

// One rail operator with its tariffs and their versions, newest first.
export const railOperatorGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/rail/operators/:customerId" },
  async ({ customerId }: RailOperatorGetRequest): Promise<RailOperatorDetail> => {
    return railTariffService.operator(getAuthData()!.companyID, customerId);
  },
);
