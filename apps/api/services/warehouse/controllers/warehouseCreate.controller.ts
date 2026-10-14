import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipments } from "~encore/clients";
import { warehouseService } from "../services/warehouse.service";
import { gateMovementService } from "../services/gateMovement.service";
import type { WarehouseTaskItem } from "../interfaces/interfaces";

interface WarehouseCreateRequest {
  shipmentId: string;
}

interface WarehouseCreateResponse {
  task: WarehouseTaskItem;
  /** False when the shipment was already in the warehouse and its existing task is returned. */
  created: boolean;
}

// Adds a shipment to the warehouse; the server assigns its WCZ reference.
export const warehouseCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse" },
  async (req: WarehouseCreateRequest): Promise<WarehouseCreateResponse> => {
    if (!req.shipmentId) {
      throw APIError.invalidArgument("shipmentId is required");
    }
    // Throws not_found unless the shipment exists in the caller's company.
    await shipments.shipmentGet({ shipmentId: req.shipmentId });
    const companyId = getAuthData()!.companyID;
    const { task, created } = await warehouseService.addShipment(companyId, req.shipmentId);
    // The new task gets its Gate Log row straight away.
    if (created) await gateMovementService.ensureForTasks(companyId);
    return { task: task as unknown as WarehouseTaskItem, created };
  },
);
