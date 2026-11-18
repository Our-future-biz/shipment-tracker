import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { RemeasureAcceptance, ShipmentItem } from "../interfaces/interfaces";

interface AcceptRemeasurementRequest {
  shipmentId: string;
  /** The warehouse's remeasured lines as the page shows them (their saved text): changed meanwhile, nothing is accepted. */
  expected: string & MaxLen<100000>;
}

interface AcceptRemeasurementResponse {
  shipment: ShipmentItem;
  acceptance: RemeasureAcceptance | null;
}

/**
 * Cargo Details → Accept remeasurement (owner decision, 18 Nov 2026): the warehouse's remeasured
 * lines replace the cargo dimension lines, and Pcs, Total Weight and Total Volume take their totals.
 * Only for who may change the shipment's details (Handled By, Holiday Cover, a manager).
 */
export const shipmentRemeasureAccept = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/remeasurement/accept" },
  async (req: AcceptRemeasurementRequest): Promise<AcceptRemeasurementResponse> => {
    const auth = getAuthData()!;
    const shipment = await shipmentService.acceptRemeasurement(req.shipmentId, auth, req.expected);
    return { shipment, acceptance: await shipmentService.remeasureAcceptance(req.shipmentId, auth.companyID) };
  },
);

interface RemeasureAcceptanceRequest {
  shipmentId: string;
}

interface RemeasureAcceptanceResponse {
  acceptance: RemeasureAcceptance | null;
}

/** The shipment's last accepted remeasurement, for Cargo Details and Costs Breakdown; null when none. */
export const shipmentRemeasureAcceptance = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/remeasurement/acceptance" },
  async (req: RemeasureAcceptanceRequest): Promise<RemeasureAcceptanceResponse> => {
    return { acceptance: await shipmentService.remeasureAcceptance(req.shipmentId, getAuthData()!.companyID) };
  },
);

/** Costs Breakdown: its quantities were checked after the last accepted remeasurement (the warning is then put away). */
export const shipmentRemeasureCostsChecked = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/remeasurement/costs-checked" },
  async (req: RemeasureAcceptanceRequest): Promise<RemeasureAcceptanceResponse> => {
    return { acceptance: await shipmentService.markRemeasureCostsChecked(req.shipmentId, getAuthData()!) };
  },
);
