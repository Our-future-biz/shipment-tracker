import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { sectionItem, warehouseService, type SectionKeyChange } from "../services/warehouse.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

interface WarehouseSectionPatchRequest {
  shipmentId: string;
  section: string;
  /**
   * The fields to save (1–10), each with the value the client last saw in `expected` ("" = not
   * set). Fields not listed are left as stored.
   */
  changes: SectionKeyChange[];
}

interface WarehouseSectionPatchResponse {
  section: WarehouseSectionItem;
}

// Saves changed fields of a section (Shipment Details: notes, remeasured lines, "sent" marks,
// operations informed). A field someone else changed since the client read it is refused with
// "Changed meanwhile … reload" (aborted); different fields saved at the same time both stay.
export const warehouseSectionPatch = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse/sections/:shipmentId/:section" },
  async (req: WarehouseSectionPatchRequest): Promise<WarehouseSectionPatchResponse> => {
    const row = await warehouseService.patchSection(req.shipmentId, req.section, getAuthData()!.companyID, req.changes);
    return { section: sectionItem(row) };
  },
);
