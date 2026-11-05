import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseSectionChange, WarehouseSectionItem } from "../interfaces/interfaces";

interface WarehouseSectionFieldsRequest {
  shipmentId: string;
  /** "job" (Shipment Details) */
  section: string;
  /** The fields to save (1–10). Fields not listed are left as stored. */
  changes: WarehouseSectionChange[];
}

interface WarehouseSectionFieldsResponse {
  section: WarehouseSectionItem;
}

// Saves changed fields of Shipment Details (notes, remeasured lines, "sent" marks). A field sent
// with the value the client last saw is refused with "Changed meanwhile … reload" (aborted) when
// someone else changed it since; different fields saved at the same time both stay.
export const warehouseSectionPatch = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse/sections/:shipmentId/:section" },
  async (req: WarehouseSectionFieldsRequest): Promise<WarehouseSectionFieldsResponse> => {
    return { section: await warehouseService.patchSection(req.shipmentId, req.section, getAuthData()!.companyID, req.changes) };
  },
);
