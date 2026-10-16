import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseTaskItem } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface WarehouseListRequest {
  shipmentId?: string;
}

interface WarehouseListResponse {
  tasks: WarehouseTaskItem[];
}

// One shipment's positions (the Shipments → Warehouse tab) are there for every company; the whole
// list is the Warehouse Concept's Positions screen.
export const warehouseList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse" },
  async (req: WarehouseListRequest): Promise<WarehouseListResponse> => {
    if (!req.shipmentId) await requireModule("warehouse_concept");
    const companyId = getAuthData()!.companyID;
    const tasks = req.shipmentId
      ? await warehouseService.listByShipmentId(req.shipmentId, companyId)
      : await warehouseService.listAll(companyId);
    return { tasks };
  },
);
