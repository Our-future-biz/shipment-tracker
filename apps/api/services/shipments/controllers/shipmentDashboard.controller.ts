import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentDashboardService } from "../services/shipmentDashboard.service";
import type { ShipmentDashboard } from "../interfaces/interfaces";

export const shipmentDashboard = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/dashboard" },
  async (): Promise<ShipmentDashboard> => {
    return shipmentDashboardService.get(getAuthData()!.companyID);
  },
);
