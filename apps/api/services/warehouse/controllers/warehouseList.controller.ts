import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseTaskItem } from "../interfaces/interfaces";

interface WarehouseListRequest {
  shipmentId?: string;
}

interface WarehouseListResponse {
  tasks: WarehouseTaskItem[];
}

export const warehouseList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse" },
  async (req: WarehouseListRequest): Promise<WarehouseListResponse> => {
    const companyId = getAuthData()!.companyID;
    const tasks = req.shipmentId
      ? await warehouseService.listByShipmentId(req.shipmentId, companyId)
      : await warehouseService.listAll(companyId);
    return { tasks: tasks as unknown as WarehouseTaskItem[] };
  },
);
