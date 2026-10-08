import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";

interface TruckCreateResponse {
  reference: string;
}

// Shipments released from Stock leave on a truck. A new truck gets the next TCZ reference;
// the shipments put on it carry that reference.
export const warehouseTruckCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-trucks" },
  async (): Promise<TruckCreateResponse> => ({
    reference: await warehouseService.createTruck(getAuthData()!.companyID),
  }),
);
