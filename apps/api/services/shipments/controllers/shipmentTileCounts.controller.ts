import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentTileCounts } from "../interfaces/interfaces";

export const shipmentTileCounts = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/tile-counts" },
  async (): Promise<ShipmentTileCounts> => {
    return shipmentService.tileCounts(getAuthData()!.companyID);
  },
);
