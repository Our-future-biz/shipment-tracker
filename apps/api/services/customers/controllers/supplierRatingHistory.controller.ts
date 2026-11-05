import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { supplierRatingService } from "../services/supplierRating.service";
import type { SupplierRatingEntry } from "../interfaces/interfaces";

interface SupplierRatingHistoryRequest {
  id: string;
}

interface SupplierRatingHistoryResponse {
  data: SupplierRatingEntry[];
}

export const supplierRatingHistory = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:id/supplier-rating/history" },
  async ({ id }: SupplierRatingHistoryRequest): Promise<SupplierRatingHistoryResponse> => {
    return { data: await supplierRatingService.history(getAuthData()!.companyID, id) };
  },
);
