import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

interface WarehouseSectionGetRequest {
  shipmentId: string;
  section: string;
}

interface WarehouseSectionGetResponse {
  section: WarehouseSectionItem | null;
}

export const warehouseSectionGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse/sections/:shipmentId/:section" },
  async (req: WarehouseSectionGetRequest): Promise<WarehouseSectionGetResponse> => {
    const row = await warehouseService.getSection(req.shipmentId, req.section, getAuthData()!.companyID);
    if (!row) return { section: null };
    return {
      section: {
        id: row.id,
        shipmentId: row.shipmentId,
        section: row.section,
        data: row.data,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  },
);
