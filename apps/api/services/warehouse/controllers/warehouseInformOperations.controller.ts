import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

interface WarehouseInformOperationsRequest {
  shipmentId: string;
  /** When Operations were last informed, as the client saw it ("" = never); a changed one is refused. */
  expected: string;
}

interface WarehouseInformOperationsResponse {
  section: WarehouseSectionItem;
  /** E-mails of the people tagged in the shipment's chat (Person in Charge, Holiday Cover); empty when nobody is set. */
  tagged: string[];
}

// Inform Operations: records when, and posts "Cargo has been remeasured by the warehouse" with the
// shipment's and the saved remeasured figures to the shipment's chat, tagging its Person in Charge
// and Holiday Cover - together, or neither.
export const warehouseInformOperations = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse/inform-operations/:shipmentId" },
  async (req: WarehouseInformOperationsRequest): Promise<WarehouseInformOperationsResponse> => {
    return warehouseService.informOperations(req.shipmentId, getAuthData()!.companyID, req.expected);
  },
);
