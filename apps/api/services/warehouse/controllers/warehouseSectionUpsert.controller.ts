import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

interface WarehouseSectionUpsertRequest {
  shipmentId: string;
  /** "job" | "customs" | "pickup" | "invoicing" */
  section: string;
  data: unknown;
}

interface WarehouseSectionUpsertResponse {
  section: WarehouseSectionItem;
}

export const warehouseSectionUpsert = api(
  { expose: true, auth: true, method: "PUT", path: "/warehouse/sections/:shipmentId/:section" },
  async (req: WarehouseSectionUpsertRequest): Promise<WarehouseSectionUpsertResponse> => {
    return { section: await warehouseService.upsertSection(req.shipmentId, req.section, getAuthData()!.companyID, req.data) };
  },
);
