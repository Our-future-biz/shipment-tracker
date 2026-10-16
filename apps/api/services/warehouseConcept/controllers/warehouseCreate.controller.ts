import { api, APIError } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipments } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import { warehouseImportService } from "../services/warehouseImport.service";
import { toTaskItem } from "../services/warehouse.service";
import { userName } from "../services/users";
import type { WarehouseConceptTaskItem } from "../interfaces/interfaces";

interface WarehouseConceptCreateRequest {
  shipmentId: string & MinLen<1> & MaxLen<36>;
}

interface WarehouseConceptCreateResponse {
  task: WarehouseConceptTaskItem;
  /** False when the shipment was already in the warehouse and its existing task is returned. */
  created: boolean;
}

// Adds one shipment to the warehouse; the server assigns its WCZ reference and makes its gate
// record in the same transaction. (Several at once: warehouseImport.)
export const warehouseCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept" },
  async (req: WarehouseConceptCreateRequest): Promise<WarehouseConceptCreateResponse> => {
    if (!isUuid(req.shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    const { companyID, userID } = getAuthData()!;
    // Throws not_found unless the shipment exists in the caller's company.
    const { shipment } = await shipments.shipmentGet({ shipmentId: req.shipmentId });
    const { task, created } = await warehouseImportService.importOne(companyID, await userName(userID), shipment);
    return { task: toTaskItem(task), created };
  },
);
