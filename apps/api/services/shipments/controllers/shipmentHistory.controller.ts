import { api, type Query } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import type { ShipmentHistoryPage } from "../interfaces/interfaces";
import { shipmentHistoryService } from "../services/shipmentHistory.service";

// A job's history (Council Outlay 11, step 6): every change kept of it, the newest first, 50 a page.
// For superadmins, admins and managers only.

interface ShipmentHistoryRequest {
  shipmentId: string;
  /** The `nextBefore` of the page before: the entries older than that one. */
  before?: Query<string>;
  /** Entries a page, 1-100; 50 when not given. */
  limit?: Query<number>;
}

export const shipmentHistory = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/history" },
  async ({ shipmentId, before, limit }: ShipmentHistoryRequest): Promise<ShipmentHistoryPage> =>
    shipmentHistoryService.page(requireRole("superadmin", "admin", "manager").companyID, shipmentId, { before, limit }),
);
