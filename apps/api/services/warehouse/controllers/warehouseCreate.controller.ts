import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseTaskItem } from "../interfaces/interfaces";

interface WarehouseCreateRequest {
  taskId: string & MinLen<1> & MaxLen<50>;
  shipmentId?: string;
}

interface WarehouseCreateResponse {
  task: WarehouseTaskItem;
}

export const warehouseCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse" },
  async (req: WarehouseCreateRequest): Promise<WarehouseCreateResponse> => {
    return { task: await warehouseService.create(getAuthData()!.companyID, req.taskId, req.shipmentId) };
  },
);
