import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { gateMovementService } from "../services/gateMovement.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

interface PickupPinGenerateResponse {
  section: WarehouseSectionItem;
}

// Operations make the pick-up PIN of a shipment (Shipments → Warehouse → Pick-up): six digits
// made on the server. A new one only once the current one is locked at the gate; logged.
export const pickupPinGenerate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse/pickup-pin/:shipmentId" },
  async ({ shipmentId }: { shipmentId: string }): Promise<PickupPinGenerateResponse> => {
    const { companyID, userID } = getAuthData()!;
    const row = await gateMovementService.generatePickupPin(shipmentId, companyID, userID);
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
