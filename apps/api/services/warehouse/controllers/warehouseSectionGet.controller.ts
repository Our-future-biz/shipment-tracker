import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

interface WarehouseSectionGetRequest {
  shipmentId: string;
  /** "job" | "customs" | "pickup" | "invoicing" */
  section: string;
}

interface WarehouseSectionGetResponse {
  section: WarehouseSectionItem | null;
}

export const warehouseSectionGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse/sections/:shipmentId/:section" },
  async (req: WarehouseSectionGetRequest): Promise<WarehouseSectionGetResponse> => {
    return { section: await warehouseService.getSection(req.shipmentId, req.section, getAuthData()!.companyID) };
  },
);
