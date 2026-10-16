import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { sectionItem, toSection, warehouseService } from "../services/warehouse.service";
import type { WarehouseConceptSectionItem } from "../interfaces/interfaces";

interface WarehouseConceptSectionUpsertRequest {
  shipmentId: string;
  /** "job" | "customs" | "pickup" | "invoicing" */
  section: string;
  data: unknown;
}

interface WarehouseConceptSectionUpsertResponse {
  section: WarehouseConceptSectionItem;
}

// Whole-section save — Pick-up only, and only its rows (the PIN is the server's). Shipment
// Details ("job"), customs and invoicing are saved field by field (warehouseSectionPatch) so
// several people and screens never overwrite each other; a whole-section save of them would
// replace what others saved meanwhile and is refused.
export const warehouseSectionUpsert = api(
  { expose: true, auth: true, method: "PUT", path: "/warehouse-concept/sections/:shipmentId/:section" },
  async (req: WarehouseConceptSectionUpsertRequest): Promise<WarehouseConceptSectionUpsertResponse> => {
    // A path parameter can't be typed as a union in Encore: checked here, without echoing it.
    const section = toSection(req.section);
    if (section === "job") {
      throw APIError.failedPrecondition("Reload the page — Shipment Details now save field by field");
    }
    if (section !== "pickup") {
      throw APIError.failedPrecondition(`The ${section} section is saved field by field (PATCH /warehouse/sections/:shipmentId/${section})`);
    }
    // Pick-up: only the rows are saved; the PIN is made by the server (pickupPinGenerate).
    const row = await warehouseService.upsertPickupRows(req.shipmentId, getAuthData()!.companyID, req.data);
    return { section: sectionItem(row) };
  },
);
