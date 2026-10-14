import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipments } from "~encore/clients";
import { warehouseImportService } from "../services/warehouseImport.service";
import { userName } from "../services/users";
import type { WarehouseTaskItem } from "../interfaces/interfaces";

interface WarehouseCreateRequest {
  shipmentId: string;
}

interface WarehouseCreateResponse {
  task: WarehouseTaskItem;
  /** False when the shipment was already in the warehouse and its existing task is returned. */
  created: boolean;
}

// Adds one shipment to the warehouse; the server assigns its WCZ reference and makes its gate
// record in the same transaction. (Several at once: warehouseImport.)
export const warehouseCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse" },
  async (req: WarehouseCreateRequest): Promise<WarehouseCreateResponse> => {
    if (!req.shipmentId) {
      throw APIError.invalidArgument("shipmentId is required");
    }
    const { companyID, userID } = getAuthData()!;
    // Throws not_found unless the shipment exists in the caller's company.
    const { shipment } = await shipments.shipmentGet({ shipmentId: req.shipmentId });
    const { task, created } = await warehouseImportService.importOne(companyID, await userName(userID), shipment);
    return { task: task as unknown as WarehouseTaskItem, created };
  },
);
