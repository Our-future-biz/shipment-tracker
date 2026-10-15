import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { haulierService } from "../services/haulier.service";
import type { TruckingHaulierResponse } from "../interfaces/interfaces";

interface TruckingHaulierGetRequest {
  customerId: string;
}

// One haulier with its trucking profile (the defaults, version 0, when none is saved yet).
// 404 when the customer is not a haulier.
export const truckingHaulierGet = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/hauliers/:customerId" },
  async ({ customerId }: TruckingHaulierGetRequest): Promise<TruckingHaulierResponse> => {
    return { haulier: await haulierService.get(getAuthData()!.companyID, customerId) };
  },
);
