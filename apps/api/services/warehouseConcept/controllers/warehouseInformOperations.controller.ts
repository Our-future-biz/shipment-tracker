import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { sectionItem, warehouseService } from "../services/warehouse.service";
import type { WarehouseConceptSectionItem } from "../interfaces/interfaces";

interface WarehouseConceptInformOperationsRequest {
  shipmentId: string;
  /** Goes with the record and the chat message; optional. */
  note?: string;
}

interface WarehouseConceptInformOperationsResponse {
  section: WarehouseConceptSectionItem;
  /** E-mails of the people tagged in the shipment's chat (Person in Charge, Holiday Cover); empty when nobody is set. */
  tagged: string[] | null;
}

// Inform Operations by shipment (a shipment's warehouse part): its live position's when it has
// one, else the shipment's own Shipment Details. Records when (with a history) and posts "Cargo has
// been remeasured by the warehouse" to the shipment's chat, tagging its Person in Charge and Holiday
// Cover - together, or neither.
export const warehouseConceptInformOperations = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/inform-operations/:shipmentId" },
  async ({ shipmentId, note }: WarehouseConceptInformOperationsRequest): Promise<WarehouseConceptInformOperationsResponse> => {
    const { companyID, userID } = getAuthData()!;
    const { row, tagged } = await warehouseService.informOperationsByShipment(shipmentId, note ?? "", companyID, userID);
    return { section: sectionItem(row), tagged };
  },
);
