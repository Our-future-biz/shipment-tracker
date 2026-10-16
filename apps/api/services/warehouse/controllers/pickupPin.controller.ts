import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { gateMovementService } from "../services/gateMovement.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";
import { sectionItem } from "../services/warehouse.service";

interface PickupPinGenerateResponse {
  /** The pick-up section, without the PIN. */
  section: WarehouseSectionItem;
  /** The new PIN — shown only in this answer; only its hash is stored. */
  pin: string;
}

// Managers make the pick-up PIN of a shipment (Shipments → Warehouse → Pick-up): six digits
// made on the server, shown once in this answer. A new one only once the current one is locked
// at the gate; logged.
export const pickupPinGenerate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse/pickup-pin/:shipmentId" },
  async ({ shipmentId }: { shipmentId: string }): Promise<PickupPinGenerateResponse> => {
    const { companyID, userID } = requireRole("superadmin", "admin", "manager");
    const { row, pin } = await gateMovementService.generatePickupPin(shipmentId, companyID, userID);
    return { section: sectionItem(row), pin };
  },
);
