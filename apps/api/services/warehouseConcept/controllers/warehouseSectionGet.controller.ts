import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { sectionItem, warehouseService } from "../services/warehouse.service";
import type { WarehouseConceptSectionItem } from "../interfaces/interfaces";

interface WarehouseSectionGetRequest {
  shipmentId: string;
  /** "job" | "customs" | "pickup" | "invoicing" */
  section: string;
}

interface WarehouseConceptSectionGetResponse {
  section: WarehouseConceptSectionItem | null;
}

export const warehouseSectionGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/sections/:shipmentId/:section" },
  async (req: WarehouseSectionGetRequest): Promise<WarehouseConceptSectionGetResponse> => {
    // An unknown section is refused (toSection); a shipment id that is not a uuid has none.
    const row = await warehouseService.getSection(req.shipmentId, req.section, getAuthData()!.companyID);
    return { section: row ? sectionItem(row) : null };
  },
);
