import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

interface WarehouseSectionUpsertRequest {
  shipmentId: string;
  section: string;
  data: unknown;
}

interface WarehouseSectionUpsertResponse {
  section: WarehouseSectionItem;
}

const VALID_SECTIONS = new Set(["job", "customs", "pickup", "invoicing"]);

export const warehouseSectionUpsert = api(
  { expose: true, auth: true, method: "PUT", path: "/warehouse/sections/:shipmentId/:section" },
  async (req: WarehouseSectionUpsertRequest): Promise<WarehouseSectionUpsertResponse> => {
    if (!VALID_SECTIONS.has(req.section)) {
      throw APIError.invalidArgument(`Invalid section: ${req.section}. Must be one of: ${[...VALID_SECTIONS].join(", ")}`);
    }
    const companyId = getAuthData()!.companyID;
    // Pick-up: only the rows are saved; the PIN is made by the server (pickupPinGenerate).
    const row =
      req.section === "pickup"
        ? await warehouseService.upsertPickupRows(req.shipmentId, companyId, req.data)
        : await warehouseService.upsertSection(req.shipmentId, req.section, companyId, req.data);
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
