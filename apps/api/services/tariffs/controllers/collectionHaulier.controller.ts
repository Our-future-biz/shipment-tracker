import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { CollectionHaulierItem } from "../interfaces/interfaces";
import { collectionTariffService, type CollectionHaulierDetail } from "../services/collectionTariff.service";

interface CollectionHaulierListResponse {
  /** Customer Database companies with the First / last mile haulier role, by name */
  hauliers: CollectionHaulierItem[];
}

// The first / last mile hauliers with their tariffs at a glance (Tariffs → Last / First Mile Collections).
export const collectionHaulierList = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/hauliers" },
  async (): Promise<CollectionHaulierListResponse> => {
    return { hauliers: await collectionTariffService.hauliers(getAuthData()!.companyID) };
  },
);

interface CollectionHaulierGetRequest {
  /** The haulier's Customer Database id */
  customerId: string;
}

// One first / last mile haulier with its tariffs and their versions, newest first.
export const collectionHaulierGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/hauliers/:customerId" },
  async ({ customerId }: CollectionHaulierGetRequest): Promise<CollectionHaulierDetail> => {
    return collectionTariffService.haulier(getAuthData()!.companyID, customerId);
  },
);
