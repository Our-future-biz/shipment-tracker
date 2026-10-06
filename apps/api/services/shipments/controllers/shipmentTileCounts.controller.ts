import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

/** Counts behind the Shipments overview tiles, over the whole company dataset. */
interface ShipmentTileCountsResponse {
  active: number;
  attention: number;
  import: number;
  export: number;
  week: number;
  nextWeek: number;
}

export const shipmentTileCounts = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/tile-counts" },
  async (): Promise<ShipmentTileCountsResponse> => {
    return shipmentService.tileCounts(getAuthData()!.companyID);
  },
);
