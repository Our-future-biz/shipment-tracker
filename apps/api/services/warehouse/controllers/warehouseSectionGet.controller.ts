import { api } from "encore.dev/api";
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
  { expose: true, auth: false, method: "GET", path: "/warehouse/sections/:shipmentId/:section" },
  async (req: WarehouseSectionGetRequest): Promise<WarehouseSectionGetResponse> => {
    const row = await warehouseService.getSection(req.shipmentId, req.section);
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
