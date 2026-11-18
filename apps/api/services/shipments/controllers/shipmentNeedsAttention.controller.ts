import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentsNeedingAttention } from "../interfaces/interfaces";

/**
 * Active shipments with something due - URGENT (`within24h`): today or the next working day, or a
 * cut-off missed; ATTENTION (`within48h`): the two working days after - over the whole company
 * dataset, on the deadline rules of Shipments → Managers.
 */
export const shipmentNeedsAttention = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/needs-attention" },
  async (): Promise<ShipmentsNeedingAttention> => {
    return shipmentService.needsAttention(getAuthData()!.companyID);
  },
);
